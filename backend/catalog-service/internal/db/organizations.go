package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
	"github.com/jackc/pgx/v5"
)

// GetOrganizations returns organizations, optionally filtered by org_type
func (db *Database) GetOrganizations(ctx context.Context, orgType *models.OrgType) ([]models.Organization, error) {
	var (
		rows pgx.Rows
		err  error
	)

	if orgType != nil {
		query := `
            SELECT
              o.org_id::text,
              o.org_type::text,
              COALESCE(o.name,''),
              o.contact_email,
              o.contact_phone,
              o.contact_address,
              o.parent_org_id::text,
              p.name AS parent_org_name
            FROM organizations o
            LEFT JOIN organizations p ON p.org_id = o.parent_org_id
            WHERE o.org_type = $1
            ORDER BY o.name
        `
		rows, err = db.Pool.Query(ctx, query, string(*orgType))
	} else {
		query := `
            SELECT
              o.org_id::text,
              o.org_type::text,
              COALESCE(o.name,''),
              o.contact_email,
              o.contact_phone,
              o.contact_address,
              o.parent_org_id::text,
              p.name AS parent_org_name
            FROM organizations o
            LEFT JOIN organizations p ON p.org_id = o.parent_org_id
            ORDER BY o.name
        `
		rows, err = db.Pool.Query(ctx, query)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orgs := make([]models.Organization, 0)
	for rows.Next() {
		var o models.Organization
		if err := rows.Scan(
			&o.ID,
			&o.OrgType,
			&o.Name,
			&o.ContactEmail,
			&o.ContactPhone,
			&o.ContactAddress,
			&o.ParentOrgID,
			&o.ParentOrgName,
		); err != nil {
			return nil, err
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}

// CreateOrganization inserts a new organization and returns its ID (uuid as text)
func (db *Database) CreateOrganization(ctx context.Context, org models.Organization) (string, error) {
	query := `
	    INSERT INTO organizations (org_type, name, contact_email, contact_phone, contact_address, parent_org_id)
	    VALUES ($1, $2, $3, $4, $5, $6)
	    RETURNING org_id::text
	`
	var id string
	err := db.Pool.QueryRow(ctx, query,
		string(org.OrgType), org.Name, org.ContactEmail, org.ContactPhone, org.ContactAddress, org.ParentOrgID,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("failed to create organization: %w", err)
	}
	return id, nil
}

// UpdateOrganization updates an existing organization
func (db *Database) UpdateOrganization(ctx context.Context, id string, org models.Organization) error {
	query := `
	    UPDATE organizations
	    SET org_type = $2,
	        name = $3,
	        contact_email = $4,
	        contact_phone = $5,
	        contact_address = $6,
	        parent_org_id = $7,
	        updated_at = CURRENT_TIMESTAMP
	    WHERE org_id = $1
	`
	cmd, err := db.Pool.Exec(ctx, query,
		id, string(org.OrgType), org.Name, org.ContactEmail, org.ContactPhone, org.ContactAddress, org.ParentOrgID,
	)
	if err != nil {
		return fmt.Errorf("failed to update organization: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("organization not found")
	}
	return nil
}

// DeleteOrganization deletes an organization by ID
func (db *Database) DeleteOrganization(ctx context.Context, id string) error {
	query := `DELETE FROM organizations WHERE org_id = $1`
	cmd, err := db.Pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete organization: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("organization not found")
	}
	return nil
}

// GetOrganizationUsers lists users assigned to an organization
func (db *Database) GetOrganizationUsers(ctx context.Context, orgID string) ([]models.OrganizationUser, error) {
	query := `
		SELECT
		  u.id::text AS user_id,
		  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name)), ''), u.username) AS full_name,
		  u.email,
		  u.role::text AS role,
		  ou.org_role::text AS org_role
		FROM organization_users ou
		JOIN users u ON u.id = ou.user_id
		WHERE ou.org_id = $1
		ORDER BY full_name
	`
	rows, err := db.Pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var res []models.OrganizationUser
	for rows.Next() {
		var u models.OrganizationUser
		if err := rows.Scan(&u.UserID, &u.FullName, &u.Email, &u.Role, &u.OrgRole); err != nil {
			return nil, err
		}
		res = append(res, u)
	}
	return res, rows.Err()
}

// SetOrganizationUsers replaces the user assignments for an organization (role-validated)
func (db *Database) SetOrganizationUsers(ctx context.Context, orgID string, assignments []models.OrganizationUserAssignment) error {
	// 1) Get org type
	var orgType string
	if err := db.Pool.QueryRow(ctx, `SELECT org_type::text FROM organizations WHERE org_id = $1`, orgID).Scan(&orgType); err != nil {
		return fmt.Errorf("organization not found: %w", err)
	}
	// 2) Brand cannot have users
	if orgType == string(models.OrgTypeBrand) {
		if len(assignments) > 0 {
			return fmt.Errorf("brand organizations cannot have users assigned")
		}
	}
	// 3) Determine required user role by org type
	var requiredRole string
	switch models.OrgType(orgType) {
	case models.OrgTypeManufacturer:
		requiredRole = "Manufacturer"
	case models.OrgType3PL:
		requiredRole = "3PL"
	case models.OrgTypePartner:
		requiredRole = "Partner"
	case models.OrgTypeBrand:
		requiredRole = ""
	}
	// 4) Validate user roles if any
	if len(assignments) > 0 && requiredRole != "" {
		userIDs := make([]string, 0, len(assignments))
		for _, a := range assignments {
			userIDs = append(userIDs, a.UserID)
		}
		// Build UUID array param
		args := make([]any, 0, len(userIDs))
		placeholders := make([]string, 0, len(userIDs))
		for i, id := range userIDs {
			args = append(args, id)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
		}
		q := fmt.Sprintf("SELECT id::text, role::text FROM users WHERE id IN (%s)", strings.Join(placeholders, ","))
		rows, err := db.Pool.Query(ctx, q, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		roles := map[string]string{}
		for rows.Next() {
			var uid, role string
			if err := rows.Scan(&uid, &role); err != nil {
				return err
			}
			roles[uid] = role
		}
		// Ensure all provided users exist and match role
		if len(roles) != len(userIDs) {
			return fmt.Errorf("one or more users not found")
		}
		for _, uid := range userIDs {
			if roles[uid] != requiredRole {
				return fmt.Errorf("user %s has role %s but requires %s for org type %s", uid, roles[uid], requiredRole, orgType)
			}
		}
	}
	// 5) Replace assignments in a transaction
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM organization_users WHERE org_id = $1`, orgID); err != nil {
		return err
	}
	allowed := map[string]bool{"Owner": true, "Manager": true, "Staff": true}
	for _, a := range assignments {
		role := a.OrgRole
		if role == "" {
			role = "Manager"
		}
		if !allowed[role] {
			return fmt.Errorf("invalid org_role: %s", role)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO organization_users (org_id, user_id, org_role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`, orgID, a.UserID, role); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}
