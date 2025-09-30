package models

// OrgType represents organization types in the system (mirrors DB enum org_type)
type OrgType string

const (
	OrgTypeManufacturer OrgType = "Manufacturer"
	OrgType3PL          OrgType = "3PL"
	OrgTypePartner      OrgType = "Partner"
	OrgTypeBrand        OrgType = "Brand"
)

// Organization represents a unified organization entity
// Backed by table `organizations`
type Organization struct {
	ID             string  `json:"org_id" db:"org_id"`
	OrgType        OrgType `json:"org_type" db:"org_type"`
	Name           string  `json:"name" db:"name"`
	ContactEmail   *string `json:"contact_email,omitempty" db:"contact_email"`
	ContactPhone   *string `json:"contact_phone,omitempty" db:"contact_phone"`
	ContactAddress *string `json:"contact_address,omitempty" db:"contact_address"`
	ParentOrgID    *string `json:"parent_org_id,omitempty" db:"parent_org_id"`
	ParentOrgName  *string `json:"parent_org_name,omitempty" db:"parent_org_name"`
}

// Region represents a sourcing/logistics region
// Backed by table `regions`
type Region struct {
	ID          int     `json:"region_id" db:"region_id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description,omitempty" db:"description"`
}

// ProductSourcing maps product -> manufacturer org -> region
// Backed by table `product_sourcing`
type ProductSourcing struct {
	ProductID         int    `json:"product_id" db:"product_id"`
	ManufacturerOrgID string `json:"manufacturer_org_id" db:"manufacturer_org_id"`
	RegionID          int    `json:"region_id" db:"region_id"`
}

// ProductLogistics maps product -> 3PL org
// Backed by table `product_logistics`
type ProductLogistics struct {
	ProductID int    `json:"product_id" db:"product_id"`
	TPLOrgID  string `json:"tpl_org_id" db:"tpl_org_id"`
}

// StorePartner maps store -> partner org
// Backed by table `store_partners`
type StorePartner struct {
	StoreID      int    `json:"store_id" db:"store_id"`
	PartnerOrgID string `json:"partner_org_id" db:"partner_org_id"`
}

// OrganizationUser represents a user assigned to an organization
// Backed by join on `organization_users` and `users`
type OrganizationUser struct {
	UserID   string  `json:"user_id" db:"user_id"`
	FullName string  `json:"full_name" db:"full_name"`
	Email    *string `json:"email,omitempty" db:"email"`
	Role     string  `json:"role" db:"role"`
	OrgRole  string  `json:"org_role" db:"org_role"`
}

// OrganizationUserAssignment represents an assignment payload with role
type OrganizationUserAssignment struct {
	UserID  string `json:"user_id"`
	OrgRole string `json:"org_role"`
}
