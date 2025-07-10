export function calculateTransactionROI({ cost, proceeds }) {
  if (typeof cost !== 'number' || cost <= 0) return null
  return ((proceeds - cost) / cost) * 100
}

export function filterTransactions(transactions = [], criteria = {}) {
  const { types, teamIds, playerIds, minValue, maxValue, startDate, endDate } = criteria
  const start = startDate ? new Date(startDate) : null
  const end = endDate ? new Date(endDate) : null
  const hasValidStart = start instanceof Date && !isNaN(start)
  const hasValidEnd = end instanceof Date && !isNaN(end)

  return transactions.filter(tx => {
    if (types && !types.includes(tx.type)) return false
    if (teamIds && !teamIds.includes(tx.teamId)) return false
    if (playerIds && !playerIds.includes(tx.playerId)) return false
    if (minValue != null && tx.value < minValue) return false
    if (maxValue != null && tx.value > maxValue) return false

    if (hasValidStart || hasValidEnd) {
      const txDate = new Date(tx.date)
      if (isNaN(txDate)) return false
      if (hasValidStart && txDate < start) return false
      if (hasValidEnd && txDate > end) return false
    }

    return true
  })
}

export function renderTransaction({ txData }) {
  const { id, date, type, playerName, teamName, cost, proceeds, value } = txData
  const roi = calculateTransactionROI(txData)
  return (
    <tr key={id}>
      <td>{new Date(date).toLocaleDateString()}</td>
      <td>{type}</td>
      <td>{playerName}</td>
      <td>{teamName}</td>
      <td>{cost}</td>
      <td>{proceeds}</td>
      <td>{value}</td>
      <td>{roi != null ? `${roi.toFixed(2)}%` : '?'}</td>
    </tr>
  )
}

renderTransaction.propTypes = {
  txData: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
    type: PropTypes.string.isRequired,
    playerName: PropTypes.string.isRequired,
    teamName: PropTypes.string.isRequired,
    cost: PropTypes.number.isRequired,
    proceeds: PropTypes.number.isRequired,
    value: PropTypes.number
  }).isRequired
}