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

  // Total normalised fixed costs per month — excludes "Beleggen" (counted under savings)
  function totalNormalisedPerMonth() {
    return getPostsNormalised()
      .filter(p => p.category_name !== 'Beleggen')
      .reduce((sum, p) => sum + p.monthly_amount, 0);
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

  // Total fixed costs actually paid in a given month — excludes "Beleggen" (counted under savings)
  function fixedCostsForMonth(year, month) {
    const monthStr = _monthStr(year, month);
    const rows     = DB.query(
      `SELECT SUM(t.amount) AS total
       FROM   transactions t
       WHERE  t.type = 'debit' AND t.post_id IS NOT NULL AND t.date LIKE ?
       AND NOT EXISTS (
         SELECT 1 FROM categories c WHERE c.id = t.category_id AND c.name = 'Beleggen'
       )`,
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

  // Structural transfers: vaste-post-linked debits with category "Eigen rekening" or "Beleggen"
  function structuralTransfersForMonth(year, month) {
    const monthStr = _monthStr(year, month);
    const rows = DB.query(
      `SELECT SUM(t.amount) AS total FROM transactions t
       WHERE  t.type = 'debit' AND t.post_id IS NOT NULL AND t.date LIKE ?
       AND EXISTS (
         SELECT 1 FROM categories c WHERE c.id = t.category_id AND c.name IN ('Eigen rekening', 'Beleggen')
       )`,
      [`${monthStr}%`]
    );
    return rows[0]?.total || 0;
  }

  // Normalised monthly amount for structural transfers — posts with "Eigen rekening" or "Beleggen"
  function structuralTransfersNormalised() {
    const posts = DB.query(
      `SELECT rp.amount, rp.frequency FROM recurring_posts rp
       JOIN categories c ON c.id = rp.category_id
       WHERE c.name IN ('Eigen rekening', 'Beleggen')`
    );
    return posts.reduce((sum, p) => sum + (p.amount * p.frequency) / 12, 0);
  }

  // Incidental internal transfers: category "Eigen rekening" but NOT linked to a recurring post
  function incidentalTransfersForMonth(year, month) {
    const monthStr = _monthStr(year, month);
    const cat      = DB.query("SELECT id FROM categories WHERE name = 'Eigen rekening'")[0];
    if (!cat) return 0;
    const rows = DB.query(
      `SELECT SUM(t.amount) AS total FROM transactions t
       WHERE  t.type = 'debit' AND t.category_id = ? AND t.post_id IS NULL AND t.date LIKE ?`,
      [cat.id, `${monthStr}%`]
    );
    return rows[0]?.total || 0;
  }

  // Total of all internal transfers (structural + incidental) for a given month
  function internalTransfersForMonth(year, month) {
    return structuralTransfersForMonth(year, month) + incidentalTransfersForMonth(year, month);
  }

  return {
    toMonthly,
    getPostsNormalised,
    totalNormalisedPerMonth,
    actualSpendingForMonth,
    fixedCostsForMonth,
    postAmountForMonth,
    structuralTransfersForMonth,
    structuralTransfersNormalised,
    incidentalTransfersForMonth,
    internalTransfersForMonth,
  };
})();
