<?php
declare(strict_types=1);

namespace App\Core\Db;

use App\Database;

/** Factory: pick the inspector matching the driver. */
final class SchemaInspectorFactory
{
    public static function make(string $driver, Database $db): SchemaInspector
    {
        return match ($driver) {
            'sqlite' => new SqliteInspector($db),
            'pgsql' => new PgInspector($db),
            default => new MysqlInspector($db),
        };
    }
}
