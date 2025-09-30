package api

import (
	"net/http"
	"strings"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
	"github.com/gin-gonic/gin"
)

// GetOrganizations handles GET /organizations?org_type=Manufacturer|3PL|Partner|Brand
func (h *Handler) GetOrganizations(c *gin.Context) {
	ctx := c.Request.Context()
	orgTypeStr := c.Query("org_type")

	var orgTypePtr *models.OrgType
	if orgTypeStr != "" {
		ot := models.OrgType(orgTypeStr)
		orgTypePtr = &ot
	}

	orgs, err := h.db.GetOrganizations(ctx, orgTypePtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch organizations"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"organizations": orgs})
}

// CreateOrganization handles POST /organizations
func (h *Handler) CreateOrganization(c *gin.Context) {
	ctx := c.Request.Context()
	var payload models.Organization
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	// Basic validation
	if payload.Name == "" || payload.OrgType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_type and name are required"})
		return
	}
	// Parent rules
	switch payload.OrgType {
	case models.OrgTypeManufacturer, models.OrgType3PL:
		if payload.ParentOrgID == nil || *payload.ParentOrgID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent organization is required for Manufacturer and 3PL"})
			return
		}
	case models.OrgTypeBrand:
		if payload.ParentOrgID != nil && *payload.ParentOrgID != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Brand organizations cannot have a parent"})
			return
		}
		// Partner: optional parent
	}
	id, err := h.db.CreateOrganization(ctx, payload)
	if err != nil {
		// Surface meaningful validation errors
		errStr := err.Error()
		if strings.Contains(errStr, "organizations_parent_must_be_brand") || strings.Contains(errStr, "CHECK (is_brand_org") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent organization must be of type 'Brand'"})
			return
		}
		if strings.Contains(errStr, "organizations_parent_org_id_fkey") || strings.Contains(errStr, "foreign key constraint") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent organization"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create organization"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"org_id": id})
}

// UpdateOrganization handles PUT /organizations/:id
func (h *Handler) UpdateOrganization(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")
	var payload models.Organization
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	if payload.Name == "" || payload.OrgType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_type and name are required"})
		return
	}
	// Parent rules
	switch payload.OrgType {
	case models.OrgTypeManufacturer, models.OrgType3PL:
		if payload.ParentOrgID == nil || *payload.ParentOrgID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent organization is required for Manufacturer and 3PL"})
			return
		}
	case models.OrgTypeBrand:
		if payload.ParentOrgID != nil && *payload.ParentOrgID != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Brand organizations cannot have a parent"})
			return
		}
	}
	if err := h.db.UpdateOrganization(ctx, id, payload); err != nil {
		// Surface meaningful validation errors
		errStr := err.Error()
		if strings.Contains(errStr, "organizations_parent_must_be_brand") || strings.Contains(errStr, "CHECK (is_brand_org") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent organization must be of type 'Brand'"})
			return
		}
		if strings.Contains(errStr, "organizations_parent_org_id_fkey") || strings.Contains(errStr, "foreign key constraint") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent organization"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update organization"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Organization updated"})
}

// DeleteOrganization handles DELETE /organizations/:id
func (h *Handler) DeleteOrganization(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")
	if err := h.db.DeleteOrganization(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete organization"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Organization deleted"})
}

// GetOrganizationUsers handles GET /organizations/:id/users
func (h *Handler) GetOrganizationUsers(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")
	users, err := h.db.GetOrganizationUsers(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch organization users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}

// SetOrganizationUsers handles POST /organizations/:id/users
// Body: { "assignments": [{"user_id": "uuid", "org_role": "Owner|Manager|Staff"}] }
func (h *Handler) SetOrganizationUsers(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")
	var body struct {
		Assignments []models.OrganizationUserAssignment `json:"assignments" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	if err := h.db.SetOrganizationUsers(ctx, id, body.Assignments); err != nil {
		// Map validation errors to 400
		errStr := err.Error()
		if strings.Contains(strings.ToLower(errStr), "brand") || strings.Contains(strings.ToLower(errStr), "role") || strings.Contains(strings.ToLower(errStr), "not found") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set organization users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Organization users updated"})
}
