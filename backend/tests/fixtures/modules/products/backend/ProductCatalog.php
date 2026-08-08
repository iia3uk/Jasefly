<?php
declare(strict_types=1);

namespace App\PackageModules\Products;

/**
 * Public catalog: search, filters, sort, facets for storefront widgets.
 */
final class ProductCatalog
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array<string, mixed> $query
     * @return array{items: list<array<string, mixed>>, total: int, facets: array<string, mixed>, meta: array<string, mixed>}
     */
    public function search(array $query): array
    {
        $all = $this->loadVisible();
        $facets = $this->buildFacets($all);

        $q = mb_strtolower(trim((string) ($query['q'] ?? '')));
        $minPrice = $this->numOrNull($query['min_price'] ?? null);
        $maxPrice = $this->numOrNull($query['max_price'] ?? null);
        $brands = $this->csvList($query['brand'] ?? $query['brands'] ?? '');
        $categories = $this->csvList($query['category'] ?? $query['categories'] ?? '');
        $tags = $this->csvList($query['tag'] ?? $query['tags'] ?? '');
        $delivery = $this->csvList($query['delivery'] ?? '');
        $original = $this->boolish($query['original'] ?? null);
        $sort = (string) ($query['sort'] ?? 'popular');
        $limit = max(1, min(100, (int) ($query['limit'] ?? 24)));
        $offset = max(0, (int) ($query['offset'] ?? 0));

        $filtered = array_values(array_filter($all, function (array $row) use (
            $q, $minPrice, $maxPrice, $brands, $categories, $tags, $delivery, $original
        ): bool {
            $price = (float) ($row['price'] ?? 0);
            if ($minPrice !== null && $price < $minPrice) {
                return false;
            }
            if ($maxPrice !== null && $price > $maxPrice) {
                return false;
            }

            $attrs = $this->decodeAttrs($row['attrs'] ?? null);
            $rowTags = $this->decodeTags($row['tags'] ?? null);

            if ($original === true) {
                $flag = $attrs['original'] ?? false;
                if (!($flag === true || $flag === 1 || $flag === '1' || $flag === 'true')) {
                    return false;
                }
            }

            if ($brands) {
                $brand = mb_strtolower(trim((string) ($attrs['brand'] ?? $attrs['category'] ?? '')));
                if ($brand === '' || !in_array($brand, $brands, true)) {
                    return false;
                }
            }

            if ($categories) {
                $cat = mb_strtolower(trim((string) ($attrs['category'] ?? '')));
                if ($cat === '' || !in_array($cat, $categories, true)) {
                    return false;
                }
            }

            if ($tags) {
                $lower = array_map(static fn(string $t) => mb_strtolower($t), $rowTags);
                $hit = false;
                foreach ($tags as $want) {
                    if (in_array($want, $lower, true)) {
                        $hit = true;
                        break;
                    }
                }
                if (!$hit) {
                    return false;
                }
            }

            if ($delivery) {
                $d = mb_strtolower(trim((string) ($attrs['delivery'] ?? '')));
                if ($d === '' || !in_array($d, $delivery, true)) {
                    return false;
                }
            }

            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    (string) ($row['title'] ?? ''),
                    (string) ($row['sku'] ?? ''),
                    (string) ($row['badge'] ?? ''),
                    (string) ($row['short_description'] ?? ''),
                    strip_tags((string) ($row['description'] ?? '')),
                    (string) ($attrs['brand'] ?? ''),
                    (string) ($attrs['category'] ?? ''),
                    implode(' ', $rowTags),
                ]));
                if (!str_contains($hay, $q)) {
                    return false;
                }
            }

            return true;
        }));

        $this->sortRows($filtered, $sort);

        $total = count($filtered);
        $items = array_slice($filtered, $offset, $limit);

        return [
            'items' => $items,
            'total' => $total,
            'facets' => $facets,
            'meta' => [
                'q' => $q,
                'min_price' => $minPrice,
                'max_price' => $maxPrice,
                'brand' => $brands,
                'category' => $categories,
                'tag' => $tags,
                'delivery' => $delivery,
                'original' => $original,
                'sort' => $sort,
                'limit' => $limit,
                'offset' => $offset,
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function loadVisible(): array
    {
        try {
            return $this->db->all(
                "SELECT * FROM products WHERE is_visible=1 AND deleted_at IS NULL ORDER BY sort_order, id"
            );
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<string, mixed>
     */
    private function buildFacets(array $rows): array
    {
        $brands = [];
        $categories = [];
        $tags = [];
        $deliveries = [];
        $min = null;
        $max = null;
        $originalCount = 0;

        foreach ($rows as $row) {
            $price = (float) ($row['price'] ?? 0);
            $min = $min === null ? $price : min($min, $price);
            $max = $max === null ? $price : max($max, $price);

            $attrs = $this->decodeAttrs($row['attrs'] ?? null);
            $brand = trim((string) ($attrs['brand'] ?? ''));
            if ($brand !== '') {
                $key = mb_strtolower($brand);
                $brands[$key] = ['value' => $brand, 'count' => ($brands[$key]['count'] ?? 0) + 1];
            }
            $cat = trim((string) ($attrs['category'] ?? ''));
            if ($cat !== '') {
                $key = mb_strtolower($cat);
                $categories[$key] = ['value' => $cat, 'count' => ($categories[$key]['count'] ?? 0) + 1];
            }
            $d = trim((string) ($attrs['delivery'] ?? ''));
            if ($d !== '') {
                $key = mb_strtolower($d);
                $deliveries[$key] = ['value' => $d, 'count' => ($deliveries[$key]['count'] ?? 0) + 1];
            }
            $flag = $attrs['original'] ?? false;
            if ($flag === true || $flag === 1 || $flag === '1' || $flag === 'true') {
                $originalCount++;
            }
            foreach ($this->decodeTags($row['tags'] ?? null) as $tag) {
                $tag = trim($tag);
                if ($tag === '') {
                    continue;
                }
                $key = mb_strtolower($tag);
                $tags[$key] = ['value' => $tag, 'count' => ($tags[$key]['count'] ?? 0) + 1];
            }
        }

        $sortFacet = static function (array $map): array {
            $list = array_values($map);
            usort($list, static fn($a, $b) => ($b['count'] <=> $a['count']) ?: strcmp((string) $a['value'], (string) $b['value']));
            return $list;
        };

        return [
            'price' => ['min' => $min ?? 0, 'max' => $max ?? 0],
            'brands' => $sortFacet($brands),
            'categories' => $sortFacet($categories),
            'tags' => $sortFacet($tags),
            'delivery' => $sortFacet($deliveries),
            'original_count' => $originalCount,
            'total' => count($rows),
        ];
    }

    /** @param list<array<string, mixed>> $rows */
    private function sortRows(array &$rows, string $sort): void
    {
        usort($rows, static function (array $a, array $b) use ($sort): int {
            return match ($sort) {
                'price_asc' => ((float) ($a['price'] ?? 0)) <=> ((float) ($b['price'] ?? 0)),
                'price_desc' => ((float) ($b['price'] ?? 0)) <=> ((float) ($a['price'] ?? 0)),
                'title' => strcmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? '')),
                'newest' => ((int) ($b['id'] ?? 0)) <=> ((int) ($a['id'] ?? 0)),
                default => (((int) ($b['sold_count'] ?? 0)) <=> ((int) ($a['sold_count'] ?? 0)))
                    ?: (((int) ($a['sort_order'] ?? 0)) <=> ((int) ($b['sort_order'] ?? 0)))
                    ?: (((int) ($a['id'] ?? 0)) <=> ((int) ($b['id'] ?? 0))),
            };
        });
    }

    /** @return array<string, mixed> */
    private function decodeAttrs(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }

    /** @return list<string> */
    private function decodeTags(mixed $raw): array
    {
        if (is_array($raw)) {
            return array_map('strval', $raw);
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? array_map('strval', $decoded) : [];
        }
        return [];
    }

    /** @return list<string> */
    private function csvList(mixed $raw): array
    {
        if (is_array($raw)) {
            $parts = $raw;
        } else {
            $parts = preg_split('/\s*,\s*/', trim((string) $raw)) ?: [];
        }
        $out = [];
        foreach ($parts as $p) {
            $s = mb_strtolower(trim((string) $p));
            if ($s !== '') {
                $out[] = $s;
            }
        }
        return array_values(array_unique($out));
    }

    private function numOrNull(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v)) {
            return null;
        }
        return (float) $v;
    }

    private function boolish(mixed $v): ?bool
    {
        if ($v === null || $v === '') {
            return null;
        }
        if ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'yes') {
            return true;
        }
        if ($v === false || $v === 0 || $v === '0' || $v === 'false') {
            return false;
        }
        return null;
    }
}
