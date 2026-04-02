# Dune Queries: ENS Renewal Verification

## Confirmed Values

- BaseRegistrar topic0 (NameRenewed): `0x9b87a00e30f1ac65d898f070f8a3488fe60517182d0a2098e1b4b93a54aa9bd6`
- New Controller topic0 (NameRenewed): `0xfa956c3bce4cb4b01166868ecaf0620566bc7e33fc70b0b9c6aef61e37e50b94`
- Event Emitter topic0 (RenewalReferred): `0xbdc63144ed642739de589db600d0c625e01c4994358ad6591b3f6e424ea59945`

## Diagnostic: Where does each referrer's data live?

Grails uses the Event Emitter (RenewalReferred), but other referrers
likely call the new controller directly. These two queries reveal which
referrer codes exist in each event source.

### Diag A: Distinct referrers in RenewalReferred (Event Emitter)

```sql
SELECT
  bytearray_substring(data, 97, 32) AS referrer,
  count(*) AS cnt
FROM ethereum.logs
WHERE contract_address = 0xf55575bde5953ee4272d5ce7cdd924c74d8fa81a
  AND topic0 = 0xbdc63144ed642739de589db600d0c625e01c4994358ad6591b3f6e424ea59945
  AND block_time >= timestamp '2026-03-01'
GROUP BY 1
ORDER BY cnt DESC
LIMIT 20
```

### Diag B: Distinct non-zero referrers in new controller NameRenewed

```sql
SELECT
  bytearray_substring(data, 97, 32) AS referrer,
  count(*) AS cnt
FROM ethereum.logs
WHERE contract_address = 0x59e16fccd424cc24e280be16e11bcd56fb0ce547
  AND topic0 = 0xfa956c3bce4cb4b01166868ecaf0620566bc7e33fc70b0b9c6aef61e37e50b94
  AND block_time >= timestamp '2026-03-01'
  AND bytearray_substring(data, 97, 32) != 0x0000000000000000000000000000000000000000000000000000000000000000
GROUP BY 1
ORDER BY cnt DESC
LIMIT 20
```

Run both and check which known referrer codes appear where. Once you
know which referrers live in which source, use Query 1 below (which
combines both sources).

## Query 1: Daily Renewals by Source (Combined)

Pulls referrer data from both sources (no double-counting — they're mutually exclusive):
- Event Emitter RenewalReferred: Grails referrals (controller event has zero referrer for these)
- New Controller NameRenewed: Vision and others calling controller directly with referrer

Old controller renewals are tracked explicitly as a separate direct category.

```sql
WITH total_renewals AS (
  -- BaseRegistrar: canonical total of ALL renewals
  SELECT date_trunc('day', block_time) AS day
  FROM ethereum.logs
  WHERE contract_address = 0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85
    AND topic0 = 0x9b87a00e30f1ac65d898f070f8a3488fe60517182d0a2098e1b4b93a54aa9bd6
    AND block_time >= timestamp '2024-11-01'
),
all_referred AS (
  -- Event Emitter: RenewalReferred (Grails and any other Event Emitter users)
  -- These renewals have zero referrer in the controller event, so no overlap with source 2
  SELECT
    date_trunc('day', block_time) AS day,
    bytearray_substring(data, 97, 32) AS referrer
  FROM ethereum.logs
  WHERE contract_address = 0xf55575bde5953ee4272d5ce7cdd924c74d8fa81a
    AND topic0 = 0xbdc63144ed642739de589db600d0c625e01c4994358ad6591b3f6e424ea59945
    AND bytearray_substring(data, 97, 32) != 0x0000000000000000000000000000000000000000000000000000000000000000
    AND block_time >= timestamp '2024-11-01'

  UNION ALL

  -- New Controller: NameRenewed with non-zero referrer (Vision etc. calling controller directly)
  SELECT
    date_trunc('day', block_time) AS day,
    bytearray_substring(data, 97, 32) AS referrer
  FROM ethereum.logs
  WHERE contract_address = 0x59e16fccd424cc24e280be16e11bcd56fb0ce547
    AND topic0 = 0xfa956c3bce4cb4b01166868ecaf0620566bc7e33fc70b0b9c6aef61e37e50b94
    AND bytearray_substring(data, 97, 32) != 0x0000000000000000000000000000000000000000000000000000000000000000
    AND block_time >= timestamp '2024-11-01'
),
-- Old Controller NameRenewed (all direct, no referrer field)
old_controller_renewals AS (
  SELECT date_trunc('day', block_time) AS day
  FROM ethereum.logs
  WHERE contract_address = 0x253553366Da8546fC250F225fe3d25d0C782303b
    AND topic0 = 0x3da0492aca547b826108d17a1f47e59bae0db5fd46b70fa66a4a87e6caf35c3c
    AND block_time >= timestamp '2024-11-01'
),
classified AS (
  SELECT
    day,
    CASE
      WHEN referrer = 0x0000000000000000000000007e491cde0fbf08e51f54c4fb6b9e24afbd18966d THEN 'grails'
      WHEN referrer = 0x000000000000000000000000f919a96d2970380b87917b04f02e6d3d08368b10 THEN 'vision'
      WHEN referrer = 0x0000000000000000000000001c0ea438837302b4516ac3f380313061ec11760f THEN 'snipezone'
      WHEN referrer = 0x000000000000000000000000efce7f86fd1efb0359a91c873e6dee9f98788713 THEN 'enstools'
      WHEN referrer = 0x0000000000000000000000009531c059098e3d194ff87febb587ab07b30b1306 THEN 'rotki'
      ELSE 'other_referrer'
    END AS source
  FROM all_referred
),
daily_totals AS (
  SELECT day, count(*) AS total FROM total_renewals GROUP BY day
),
daily_old AS (
  SELECT day, count(*) AS old_controller FROM old_controller_renewals GROUP BY day
),
daily_referred AS (
  SELECT
    day,
    count(*) FILTER (WHERE source = 'grails') AS grails,
    count(*) FILTER (WHERE source = 'vision') AS vision,
    count(*) FILTER (WHERE source = 'snipezone') AS snipezone,
    count(*) FILTER (WHERE source = 'enstools') AS enstools,
    count(*) FILTER (WHERE source = 'rotki') AS rotki,
    count(*) AS total_referred
  FROM classified
  GROUP BY day
)
SELECT
  t.day,
  t.total,
  COALESCE(r.grails, 0) AS grails,
  COALESCE(r.vision, 0) AS vision,
  COALESCE(r.snipezone, 0) AS snipezone,
  COALESCE(r.enstools, 0) AS enstools,
  COALESCE(r.rotki, 0) AS rotki,
  COALESCE(o.old_controller, 0) AS old_controller_direct,
  t.total - COALESCE(r.total_referred, 0) - COALESCE(o.old_controller, 0) AS new_controller_direct,
  t.total - COALESCE(r.total_referred, 0) AS direct,
  round(100.0 * COALESCE(r.grails, 0) / t.total, 1) AS grails_pct
FROM daily_totals t
LEFT JOIN daily_referred r ON t.day = r.day
LEFT JOIN daily_old o ON t.day = o.day
ORDER BY t.day
```

## Query 1b: Daily Renewals by Source (30-Day Trailing Window)

```sql
WITH total_renewals AS (
  SELECT date_trunc('day', block_time) AS day
  FROM ethereum.logs
  WHERE contract_address = 0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85
    AND topic0 = 0x9b87a00e30f1ac65d898f070f8a3488fe60517182d0a2098e1b4b93a54aa9bd6
    AND block_time >= timestamp '2025-11-01'
),
all_referred AS (
  SELECT
    date_trunc('day', block_time) AS day,
    bytearray_substring(data, 97, 32) AS referrer
  FROM ethereum.logs
  WHERE contract_address = 0xf55575bde5953ee4272d5ce7cdd924c74d8fa81a
    AND topic0 = 0xbdc63144ed642739de589db600d0c625e01c4994358ad6591b3f6e424ea59945
    AND bytearray_substring(data, 97, 32) != 0x0000000000000000000000000000000000000000000000000000000000000000
    AND block_time >= timestamp '2025-11-01'

  UNION ALL

  SELECT
    date_trunc('day', block_time) AS day,
    bytearray_substring(data, 97, 32) AS referrer
  FROM ethereum.logs
  WHERE contract_address = 0x59e16fccd424cc24e280be16e11bcd56fb0ce547
    AND topic0 = 0xfa956c3bce4cb4b01166868ecaf0620566bc7e33fc70b0b9c6aef61e37e50b94
    AND bytearray_substring(data, 97, 32) != 0x0000000000000000000000000000000000000000000000000000000000000000
    AND block_time >= timestamp '2025-11-01'
),
old_controller_renewals AS (
  SELECT date_trunc('day', block_time) AS day
  FROM ethereum.logs
  WHERE contract_address = 0x253553366Da8546fC250F225fe3d25d0C782303b
    AND topic0 = 0x3da0492aca547b826108d17a1f47e59bae0db5fd46b70fa66a4a87e6caf35c3c
    AND block_time >= timestamp '2025-11-01'
),
classified AS (
  SELECT
    day,
    CASE
      WHEN referrer = 0x0000000000000000000000007e491cde0fbf08e51f54c4fb6b9e24afbd18966d THEN 'grails'
      WHEN referrer = 0x000000000000000000000000f919a96d2970380b87917b04f02e6d3d08368b10 THEN 'vision'
      WHEN referrer = 0x0000000000000000000000001c0ea438837302b4516ac3f380313061ec11760f THEN 'snipezone'
      WHEN referrer = 0x000000000000000000000000efce7f86fd1efb0359a91c873e6dee9f98788713 THEN 'enstools'
      WHEN referrer = 0x0000000000000000000000009531c059098e3d194ff87febb587ab07b30b1306 THEN 'rotki'
      ELSE 'other_referrer'
    END AS source
  FROM all_referred
),
daily_totals AS (
  SELECT day, count(*) AS total FROM total_renewals GROUP BY day
),
daily_old AS (
  SELECT day, count(*) AS old_controller FROM old_controller_renewals GROUP BY day
),
daily_referred AS (
  SELECT
    day,
    count(*) FILTER (WHERE source = 'grails') AS grails,
    count(*) FILTER (WHERE source = 'vision') AS vision,
    count(*) FILTER (WHERE source = 'snipezone') AS snipezone,
    count(*) FILTER (WHERE source = 'enstools') AS enstools,
    count(*) FILTER (WHERE source = 'rotki') AS rotki,
    count(*) AS total_referred
  FROM classified
  GROUP BY day
),
daily_combined AS (
  SELECT
    t.day,
    t.total,
    COALESCE(r.grails, 0) AS grails,
    COALESCE(r.vision, 0) AS vision,
    COALESCE(r.snipezone, 0) AS snipezone,
    COALESCE(r.enstools, 0) AS enstools,
    COALESCE(r.rotki, 0) AS rotki,
    COALESCE(o.old_controller, 0) AS old_controller_direct,
    t.total - COALESCE(r.total_referred, 0) - COALESCE(o.old_controller, 0) AS new_controller_direct,
    t.total - COALESCE(r.total_referred, 0) AS direct
  FROM daily_totals t
  LEFT JOIN daily_referred r ON t.day = r.day
  LEFT JOIN daily_old o ON t.day = o.day
)
SELECT * FROM (
  SELECT
    day,
    sum(total) OVER w AS total_30d,
    sum(grails) OVER w AS grails_30d,
    sum(vision) OVER w AS vision_30d,
    sum(snipezone) OVER w AS snipezone_30d,
    sum(enstools) OVER w AS enstools_30d,
    sum(rotki) OVER w AS rotki_30d,
    sum(old_controller_direct) OVER w AS old_controller_direct_30d,
    sum(new_controller_direct) OVER w AS new_controller_direct_30d,
    sum(direct) OVER w AS direct_30d,
    round(100.0 * sum(grails) OVER w / sum(total) OVER w, 1) AS grails_pct_30d
  FROM daily_combined
  WINDOW w AS (ORDER BY day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
)
WHERE day >= now() - interval '30' day
ORDER BY day
```

## Query 2: Grails vs Direct (Simplified)

```sql
WITH total_per_day AS (
  SELECT date_trunc('day', block_time) AS day, count(*) AS total
  FROM ethereum.logs
  WHERE contract_address = 0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85
    AND topic0 = 0x9b87a00e30f1ac65d898f070f8a3488fe60517182d0a2098e1b4b93a54aa9bd6
    AND block_time >= timestamp '2024-11-01'
  GROUP BY 1
),
grails_per_day AS (
  SELECT date_trunc('day', block_time) AS day, count(*) AS grails
  FROM ethereum.logs
  WHERE contract_address = 0xf55575bde5953ee4272d5ce7cdd924c74d8fa81a
    AND topic0 = 0xbdc63144ed642739de589db600d0c625e01c4994358ad6591b3f6e424ea59945
    AND bytearray_substring(data, 97, 32) = 0x0000000000000000000000007e491cde0fbf08e51f54c4fb6b9e24afbd18966d
    AND block_time >= timestamp '2024-11-01'
  GROUP BY 1
)
SELECT
  t.day,
  COALESCE(g.grails, 0) AS grails_renewals,
  t.total - COALESCE(g.grails, 0) AS direct_renewals,
  t.total,
  round(100.0 * COALESCE(g.grails, 0) / t.total, 1) AS grails_pct
FROM total_per_day t
LEFT JOIN grails_per_day g ON t.day = g.day
ORDER BY t.day
```

## Query 3: Old vs New Controller Traffic

```sql
SELECT
  date_trunc('day', block_time) AS day,
  CASE
    WHEN contract_address = 0x253553366Da8546fC250F225fe3d25d0C782303b THEN 'old_controller'
    WHEN contract_address = 0x59e16fccd424cc24e280be16e11bcd56fb0ce547 THEN 'new_controller'
  END AS controller,
  count(*) AS renewals
FROM ethereum.logs
WHERE contract_address IN (
  0x253553366Da8546fC250F225fe3d25d0C782303b,
  0x59e16fccd424cc24e280be16e11bcd56fb0ce547
)
AND topic0 IN (
  0x3da0492aca547b826108d17a1f47e59bae0db5fd46b70fa66a4a87e6caf35c3c,
  0xfa956c3bce4cb4b01166868ecaf0620566bc7e33fc70b0b9c6aef61e37e50b94
)
AND block_time >= timestamp '2024-11-01'
GROUP BY 1, 2
ORDER BY 1, 2
```
