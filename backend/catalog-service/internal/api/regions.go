package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListRegions handles GET /regions
func (h *Handler) ListRegions(c *gin.Context) {
	ctx := c.Request.Context()
	regions, err := h.db.ListRegions(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch regions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"regions": regions})
}

// CreateRegion handles POST /regions
func (h *Handler) CreateRegion(c *gin.Context) {
	type reqBody struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
	}
	var req reqBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}
	ctx := c.Request.Context()
	region, err := h.db.CreateRegion(ctx, req.Name, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create region"})
		return
	}
	c.JSON(http.StatusCreated, region)
}

// UpdateRegion handles PUT /regions/:id
func (h *Handler) UpdateRegion(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid region id"})
		return
	}
	type reqBody struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
	}
	var req reqBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}
	ctx := c.Request.Context()
	region, err := h.db.UpdateRegion(ctx, id, req.Name, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update region"})
		return
	}
	c.JSON(http.StatusOK, region)
}

// DeleteRegion handles DELETE /regions/:id
func (h *Handler) DeleteRegion(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid region id"})
		return
	}
	ctx := c.Request.Context()
	if err := h.db.DeleteRegion(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete region"})
		return
	}
	c.Status(http.StatusNoContent)
}

