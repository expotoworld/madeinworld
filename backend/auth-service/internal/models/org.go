package models

type OrgMembership struct {
    OrgID   string `json:"org_id" db:"org_id"`
    OrgType string `json:"org_type" db:"org_type"`
    OrgRole string `json:"org_role" db:"org_role"`
    Name    string `json:"name" db:"name"`
}

