<?php
declare(strict_types=1);

namespace App\Platform\Package;

/**
 * Public base class for ZIP modules — re-export of core abstract without packages importing App\Core.
 */
abstract class AbstractPackageModule extends \App\Core\Modules\AbstractPackageModule
{
}
