package db

import (
	"context"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
)

// SetProductSourcing replaces sourcing mappings for a product atomically
func (db *Database) SetProductSourcing(ctx context.Context, productID int, sourcing []models.ProductSourcing) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_sourcing WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for _, s := range sourcing {
		if _, err := tx.Exec(ctx, `INSERT INTO product_sourcing (product_id, manufacturer_org_id, region_id) VALUES ($1,$2,$3)`,
			productID, s.ManufacturerOrgID, s.RegionID,
		); err != nil { return err }
	}
	return tx.Commit(ctx)
}

// SetProductLogistics replaces logistics mappings for a product atomically
func (db *Database) SetProductLogistics(ctx context.Context, productID int, logistics []models.ProductLogistics) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_logistics WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for _, l := range logistics {
		if _, err := tx.Exec(ctx, `INSERT INTO product_logistics (product_id, tpl_org_id) VALUES ($1,$2)`,
			productID, l.TPLOrgID,
		); err != nil { return err }
	}
	return tx.Commit(ctx)
}

// SetStorePartners replaces partner mappings for a store atomically
func (db *Database) SetStorePartners(ctx context.Context, storeID int, partners []models.StorePartner) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM store_partners WHERE store_id = $1`, storeID); err != nil {
		return err
	}
	for _, p := range partners {
		if _, err := tx.Exec(ctx, `INSERT INTO store_partners (store_id, partner_org_id) VALUES ($1,$2)`,
			storeID, p.PartnerOrgID,
		); err != nil { return err }
	}
	return tx.Commit(ctx)
}

