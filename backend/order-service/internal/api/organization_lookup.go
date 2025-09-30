package api

import (
	"context"
	"fmt"
)

// resolveProductIntID converts product_uuid to integer product_id
func (h *Handler) resolveProductIntID(ctx context.Context, productUUID string) (int, error) {
	var id int
	q := `SELECT product_id FROM products WHERE product_uuid = $1`
	if err := h.db.Pool.QueryRow(ctx, q, productUUID).Scan(&id); err != nil {
		return 0, fmt.Errorf("resolveProductIntID: %w", err)
	}
	return id, nil
}

// getStoreRegionID returns region_id for a store (may be NULL)
func (h *Handler) getStoreRegionID(ctx context.Context, storeID int) (*int, error) {
	var regionID *int
	q := `SELECT region_id FROM stores WHERE store_id = $1`
	if err := h.db.Pool.QueryRow(ctx, q, storeID).Scan(&regionID); err != nil {
		return nil, fmt.Errorf("getStoreRegionID: %w", err)
	}
	return regionID, nil
}

// getManufacturerForProductAndRegion returns manufacturer_org_id for a product and region (if any)
func (h *Handler) getManufacturerForProductAndRegion(ctx context.Context, productUUID string, storeID *int) (*string, error) {
	// If no store, cannot resolve region-specific manufacturer
	if storeID == nil {
		return nil, nil
	}
	intID, err := h.resolveProductIntID(ctx, productUUID)
	if err != nil { return nil, err }
	regionID, err := h.getStoreRegionID(ctx, *storeID)
	if err != nil { return nil, err }
	if regionID == nil { return nil, nil }

	var orgID *string
	q := `SELECT manufacturer_org_id::text FROM product_sourcing WHERE product_id = $1 AND region_id = $2 LIMIT 1`
	if err := h.db.Pool.QueryRow(ctx, q, intID, *regionID).Scan(&orgID); err != nil {
		// No mapping found is not an error
		return nil, nil
	}
	return orgID, nil
}

// getTPLsForProduct returns list of tpl_org_id for a product
func (h *Handler) getTPLsForProduct(ctx context.Context, productUUID string) ([]string, error) {
	intID, err := h.resolveProductIntID(ctx, productUUID)
	if err != nil { return nil, err }
	rows, err := h.db.Pool.Query(ctx, `SELECT tpl_org_id::text FROM product_logistics WHERE product_id = $1`, intID)
	if err != nil { return nil, err }
	defer rows.Close()
	var list []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil { return nil, err }
		list = append(list, id)
	}
	return list, rows.Err()
}

// getPartnersForStore returns list of partner_org_id for a store
func (h *Handler) getPartnersForStore(ctx context.Context, storeID *int) ([]string, error) {
	if storeID == nil { return nil, nil }
	rows, err := h.db.Pool.Query(ctx, `SELECT partner_org_id::text FROM store_partners WHERE store_id = $1`, *storeID)
	if err != nil { return nil, err }
	defer rows.Close()
	var list []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil { return nil, err }
		list = append(list, id)
	}
	return list, rows.Err()
}

