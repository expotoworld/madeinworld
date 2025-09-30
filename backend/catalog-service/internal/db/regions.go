package db

import (
	"context"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
)

// ListRegions returns all regions ordered by name
func (db *Database) ListRegions(ctx context.Context) ([]models.Region, error) {
	rows, err := db.Pool.Query(ctx, `SELECT region_id, name, description FROM regions ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	regions := make([]models.Region, 0)
	for rows.Next() {
		var r models.Region
		if err := rows.Scan(&r.ID, &r.Name, &r.Description); err != nil {
			return nil, err
		}
		regions = append(regions, r)
	}
	return regions, rows.Err()
}

// CreateRegion inserts a new region
func (db *Database) CreateRegion(ctx context.Context, name string, description *string) (*models.Region, error) {
	var r models.Region
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO regions (name, description) VALUES ($1, $2) RETURNING region_id, name, description`,
		name, description,
	).Scan(&r.ID, &r.Name, &r.Description)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// UpdateRegion updates region fields
func (db *Database) UpdateRegion(ctx context.Context, id int, name string, description *string) (*models.Region, error) {
	var r models.Region
	err := db.Pool.QueryRow(ctx,
		`UPDATE regions SET name = $2, description = $3 WHERE region_id = $1 RETURNING region_id, name, description`,
		id, name, description,
	).Scan(&r.ID, &r.Name, &r.Description)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// DeleteRegion deletes a region by ID
func (db *Database) DeleteRegion(ctx context.Context, id int) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM regions WHERE region_id = $1`, id)
	return err
}

