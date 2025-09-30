package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
	"github.com/gin-gonic/gin"
)

// SetProductSourcing handles POST /products/:id/sourcing
// Body: { "mappings": [ {"manufacturer_org_id": "uuid", "region_id": 1}, ... ] }
func (h *Handler) SetProductSourcing(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product id"})
		return
	}

	var body struct {
		Mappings []models.ProductSourcing `json:"mappings" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// Normalize product_id in payload
	for i := range body.Mappings {
		body.Mappings[i].ProductID = productID
	}

	if err := h.db.SetProductSourcing(c.Request.Context(), productID, body.Mappings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save product sourcing"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// SetProductLogistics handles POST /products/:id/logistics
// Body: { "mappings": [ {"tpl_org_id": "uuid"}, ... ] }
func (h *Handler) SetProductLogistics(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product id"})
		return
	}

	var body struct {
		Mappings []models.ProductLogistics `json:"mappings" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// Normalize product_id in payload
	for i := range body.Mappings {
		body.Mappings[i].ProductID = productID
	}

	if err := h.db.SetProductLogistics(c.Request.Context(), productID, body.Mappings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save product logistics"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// GetProductSourcing handles GET /products/:id/sourcing
// Returns current sourcing mapping(s) for a product with org names
func (h *Handler) GetProductSourcing(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product id"})
		return
	}

	rows, err := h.db.Pool.Query(c.Request.Context(), `
        SELECT ps.manufacturer_org_id::text, ps.region_id, COALESCE(o.name, '')
        FROM product_sourcing ps
        LEFT JOIN organizations o ON o.org_id = ps.manufacturer_org_id
        WHERE ps.product_id = $1
        ORDER BY o.name
    `, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product sourcing"})
		return
	}
	defer rows.Close()

	type sourcingResp struct {
		ManufacturerOrgID string `json:"manufacturer_org_id"`
		RegionID          int    `json:"region_id"`
		Name              string `json:"name"`
	}
	var mappings []sourcingResp
	for rows.Next() {
		var item sourcingResp
		if err := rows.Scan(&item.ManufacturerOrgID, &item.RegionID, &item.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan product sourcing"})
			return
		}
		mappings = append(mappings, item)
	}
	if mappings == nil {
		mappings = []sourcingResp{}
	}

	c.JSON(http.StatusOK, gin.H{"mappings": mappings})
}

// GetProductLogistics handles GET /products/:id/logistics
// Returns current logistics mapping(s) for a product with org names
func (h *Handler) GetProductLogistics(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product id"})
		return
	}

	rows, err := h.db.Pool.Query(c.Request.Context(), `
        SELECT pl.tpl_org_id::text, COALESCE(o.name, '')
        FROM product_logistics pl
        LEFT JOIN organizations o ON o.org_id = pl.tpl_org_id
        WHERE pl.product_id = $1
        ORDER BY o.name
    `, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product logistics"})
		return
	}
	defer rows.Close()

	type logisticsResp struct {
		TPLOrgID string `json:"tpl_org_id"`
		Name     string `json:"name"`
	}
	var mappings []logisticsResp
	for rows.Next() {
		var item logisticsResp
		if err := rows.Scan(&item.TPLOrgID, &item.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan product logistics"})
			return
		}
		mappings = append(mappings, item)
	}
	if mappings == nil {
		mappings = []logisticsResp{}
	}

	c.JSON(http.StatusOK, gin.H{"mappings": mappings})
}

// SetStorePartners handles POST /stores/:id/partners
// Body: { "mappings": [ {"partner_org_id": "uuid"}, ... ] }
func (h *Handler) SetStorePartners(c *gin.Context) {
	storeIDStr := c.Param("id")
	storeID, err := strconv.Atoi(storeIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid store id"})
		return
	}

	var body struct {
		Mappings []models.StorePartner `json:"mappings" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// Normalize store_id in payload
	for i := range body.Mappings {
		body.Mappings[i].StoreID = storeID
	}

	if err := h.db.SetStorePartners(c.Request.Context(), storeID, body.Mappings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save store partners"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// GetStorePartners handles GET /stores/:id/partners
// Returns current partner mapping(s)
func (h *Handler) GetStorePartners(c *gin.Context) {
	storeIDStr := c.Param("id")
	storeID, err := strconv.Atoi(storeIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid store id"})
		return
	}

	rows, err := h.db.Pool.Query(c.Request.Context(), `
        SELECT sp.partner_org_id::text, COALESCE(o.name, '')
        FROM store_partners sp
        LEFT JOIN organizations o ON o.org_id = sp.partner_org_id
        WHERE sp.store_id = $1
        ORDER BY o.name
    `, storeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch store partners"})
		return
	}
	defer rows.Close()

	type partnerResp struct {
		PartnerOrgID string `json:"partner_org_id"`
		Name         string `json:"name"`
	}
	var partners []partnerResp
	for rows.Next() {
		var item partnerResp
		if err := rows.Scan(&item.PartnerOrgID, &item.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan store partners"})
			return
		}
		partners = append(partners, item)
	}
	if partners == nil {
		partners = []partnerResp{}
	}

	c.JSON(http.StatusOK, gin.H{"partners": partners})
}

// GetStorePartnersBatch handles GET /store-partners?store_ids=7,10,11
// Returns mapping from store_id to { partners: [...] }
func (h *Handler) GetStorePartnersBatch(c *gin.Context) {
	idsParam := strings.TrimSpace(c.Query("store_ids"))
	if idsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "store_ids query parameter is required"})
		return
	}

	// Parse comma-separated store IDs
	var ids []int
	for _, tok := range strings.Split(idsParam, ",") {
		s := strings.TrimSpace(tok)
		if s == "" {
			continue
		}
		id, err := strconv.Atoi(s)
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid store id in store_ids: " + s})
			return
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid store ids found"})
		return
	}

	// Build IN clause with positional placeholders
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "$" + strconv.Itoa(i+1)
		args[i] = id
	}
	sql := `
    SELECT sp.store_id, sp.partner_org_id::text, COALESCE(o.name, '')
    FROM store_partners sp
    LEFT JOIN organizations o ON o.org_id = sp.partner_org_id
    WHERE sp.store_id IN (` + strings.Join(placeholders, ",") + `)
    ORDER BY sp.store_id, o.name
  `
	rows, err := h.db.Pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch store partners"})
		return
	}
	defer rows.Close()

	type partnerResp struct {
		PartnerOrgID string `json:"partner_org_id"`
		Name         string `json:"name"`
	}
	type perStore struct {
		Partners []partnerResp `json:"partners"`
	}

	results := map[string]perStore{}
	for _, id := range ids {
		results[strconv.Itoa(id)] = perStore{Partners: []partnerResp{}}
	}

	for rows.Next() {
		var storeID int
		var pid, name string
		if err := rows.Scan(&storeID, &pid, &name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan store partners"})
			return
		}
		key := strconv.Itoa(storeID)
		st := results[key]
		st.Partners = append(st.Partners, partnerResp{PartnerOrgID: pid, Name: name})
		results[key] = st
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}
