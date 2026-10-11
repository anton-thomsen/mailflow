#!/usr/bin/env bash
# Breaks one rule at a time and expects the test suite to fail. A mutant that survives means a test is missing.
set -u
cd "$(dirname "$0")/.."
mutants=(
  "src/server/engine.ts|stopOn.includes(event.type)) continue|stopOn.includes(event.type) \&\& false) continue"
  "src/server/engine.ts|if (existing?.status === \"pending\")|if (false)"
  'src/server/engine.ts|AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})|'
  "src/domain/email.ts|return encode(value);|return value;"
  "src/server/engine.ts|cursor: result ? action.yes : action.no|cursor: action.no"
  "src/domain/signing.ts|Math.abs(now / 1000 - t) > TOLERANCE_S|false"
  "src/server/engine.ts|if (!(e instanceof DeliveryRefused)) {|if (false) {"
  "src/server/engine.ts|if (await tx.event.findUnique({ where: { id: event.id }, select: { id: true } })) return { duplicate: true };|"
)
survivors=0
for m in "${mutants[@]}"; do
  IFS='|' read -r file from to <<<"$m"
  cp "$file" /tmp/mutant.bak
  sed -i "s|$from|$to|" "$file"
  if cmp -s "$file" /tmp/mutant.bak; then echo "NOT APPLIED  $file: $from"; survivors=$((survivors+1)); continue; fi
  if npx vitest run >/dev/null 2>&1; then echo "SURVIVED     $file: $from"; survivors=$((survivors+1)); else echo "killed       $file: $from"; fi
  cp /tmp/mutant.bak "$file"
done
exit $survivors
