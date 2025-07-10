const DraftBoard = ({ draftId }) => {
  const [draftData, setDraftData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!draftId) return
    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await axios.get(`/api/drafts/${draftId}`, {
          signal: controller.signal
        })
        if (isMounted.current) {
          setDraftData(response.data)
        }
      } catch (err) {
        if (isMounted.current && !controller.signal.aborted) {
          setError('Failed to load draft details.')
        }
      } finally {
        if (isMounted.current) {
          setLoading(false)
        }
      }
    }
    fetchData()
    return () => {
      controller.abort()
    }
  }, [draftId])

  const updateDraftPick = useCallback(
    async ({ pickId, playerId }) => {
      if (!draftData) return
      setError(null)
      const previousPicks = [...draftData.picks]
      const updatedPicks = draftData.picks.map(p =>
        p.id === pickId ? { ...p, playerId } : p
      )
      if (isMounted.current) {
        setDraftData({ ...draftData, picks: updatedPicks })
      }
      try {
        await axios.put(
          `/api/drafts/${draftId}/picks/${pickId}`,
          { playerId }
        )
        if (isMounted.current) {
          setError(null)
        }
      } catch (err) {
        if (isMounted.current) {
          setDraftData({ ...draftData, picks: previousPicks })
          setError('Failed to update pick. Please try again.')
        }
      }
    },
    [draftData, draftId]
  )

  const renderDraftBoard = data => {
    const rounds = Array.from(
      data.picks.reduce((set, pick) => set.add(pick.round), new Set())
    ).sort((a, b) => a - b)
    return rounds.map(round => {
      const picksThisRound = data.picks
        .filter(pick => pick.round === round)
        .sort((a, b) => a.pickNumber - b.pickNumber)
      return (
        <div key={round} className="draft-round">
          <h3>Round {round}</h3>
          <table className="draft-table">
            <thead>
              <tr>
                <th>Pick #</th>
                <th>Team</th>
                <th>Player</th>
              </tr>
            </thead>
            <tbody>
              {picksThisRound.map(pick => (
                <tr key={pick.id}>
                  <td>{pick.pickNumber}</td>
                  <td>{pick.teamName}</td>
                  <td>
                    <select
                      value={pick.playerId || ''}
                      onChange={e =>
                        updateDraftPick({
                          pickId: pick.id,
                          playerId: e.target.value || null
                        })
                      }
                    >
                      <option value="">-- Unassigned --</option>
                      {data.availablePlayers.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    })
  }

  if (loading) {
    return <div>Loading draft board...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  if (!draftData) {
    return null
  }

  return <div className="draft-board">{renderDraftBoard(draftData)}</div>
}

DraftBoard.propTypes = {
  draftId: PropTypes.string.isRequired
}

export default DraftBoard