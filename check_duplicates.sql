SELECT 
  claim_number,
  COUNT(*) as count,
  GROUP_CONCAT(id) as claim_ids
FROM claims
WHERE claim_number LIKE 'CLM-EVENT-%'
GROUP BY claim_number
HAVING count > 1
ORDER BY count DESC
LIMIT 20;
