<?php
declare(strict_types=1);

namespace App;

use Throwable;

final class MigrationException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?string $sqlPreview = null,
        int $code = 0,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, $code, $previous);
    }
}
