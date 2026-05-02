// ============================================================
// NORMALISATION.JS — Monthly amount normalisation logic
//
// Core idea: all recurring costs are converted to a monthly
// equivalent so they can be compared on equal footing.
//
// Formula: (amount × frequency) / 12
//
// Examples:
//   Municipal tax  €180 × 10 = €1800/year → €150/month
//   Car insurance  €340 × 2  = €680/year  → €56.67/month
//   Streaming      €12 × 12  = €144/year  → €12/month
// ============================================================

const Normalisation = (() => {

  // Convert a single amount + frequency to a monthly equivalent
  function toMonthly(amount, frequency) {
    return (amount * frequency) / 12;
  }

  // Return all recurring posts enriched with their normalised monthly amount
  function getPostsNormalised() {
    const posts = DB.query(`
      SELECT rp.*, c.name AS category_name
      FROM   recurring_posts rp
      LEFT JOIN categories c ON c.id = rp.category_id
    `);

    return posts.map(p => ({
      ...p,
      monthly_amount: toMonthly(p.amount, p.frequency),
    }));
  }

  // Total normalised fixed costs per month (sum of all recurring posts)
  function totalNormalisedPerMonth() {
    return getPostsNormalised().reduce((sum, p) => sum + p.monthly_amount, 0);
  }

  // Total actual spending in a given month (all debit transactions)
  function actualSpendingForMonth(year, month) {
    const monthStr = _monthStr(year, month);
    const rows     = DB.query(
      `SELECT SUM(amount) AS total FROM transactions
       WHERE  type = 'debit' AND date LIKE ?`,
      [`${monthStr}%`]
    );
    return rows[0]?.total || 0;
  }

  // Total fixed costs actually paid in a given month
  // (only transactions matched to a recurring post)
  function fixedCostsForMonth(year, month) {
    const monthStr = _monthStr(year, month);
    const rows     = DB.query(
      `SELECT SUM(t.amount) AS total
       FROM   transactions t
       WHERE  t.type = 'debit' AND t.post_id IS NOT NULL AND t.date LIKE ?`,
      [`${monthStr}%`]
    );
    return rows[0]?.total || 0;
  }

  // Actual amount paid for a specific recurring post in a given month
  function postAmountForMonth(postId, year, month) {
    const monthStr = _monthStr(year, month);
    const rows     = DB.query(
      `SELECT SUM(amount) AS total FROM transactions
       WHERE  post_id = ? AND date LIKE ?`,
      [postId, `${monthStr}%`]
    );
    return rows[0]?.total || 0;
  }

  // Helper: format year + month as "YYYY-MM"
  function _monthStr(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  return {
    toMonthly,
    getPostsNormalised,
    totalNormalisedPerMonth,
    actualSpendingForMonth,
    fixedCostsForMonth,
    postAmountForMonth,
  };
})();
