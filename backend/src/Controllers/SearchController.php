<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Services\SearchService;

final class SearchController
{
    public function __construct(private SearchService $search) {}

    public function global(Request $r): never
    {
        $q = (string) $r->query('q', '');
        Response::json([
            'data' => $this->search->search($q, (int) $r->query('limit', 20)),
            'meta' => ['query' => $q],
        ]);
    }

    public function publicSearch(Request $r): never
    {
        $q = (string) ($r->query('q') ?? '');
        $limit = min(30, max(1, (int) ($r->query('limit') ?? 12)));
        Response::json([
            'data' => $this->search->publicSearch($q, $limit),
            'meta' => ['query' => $q],
        ]);
    }
}
