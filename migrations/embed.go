package migrations

import "embed"

// FS embeds all PostgreSQL SQL migration files for automatic bootstrap at startup.
//
//go:embed *.up.sql
var FS embed.FS
