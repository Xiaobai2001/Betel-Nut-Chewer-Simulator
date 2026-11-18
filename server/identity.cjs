// Keep existing numeric IDs compatible; large BIGINT IDs must never pass through Number.
function publicId(value) {
  const id = String(value);
  return BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : id;
}
function sameId(left, right) {
  const valid = value => typeof value === 'string' ? /^[1-9][0-9]{0,19}$/.test(value) : Number.isSafeInteger(value) && value > 0;
  return valid(left) && valid(right) && String(left) === String(right);
}
module.exports = { publicId, sameId };
