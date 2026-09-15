import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Trash2, Star, MessageSquare } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export default function Comments() {
  const { isAdmin } = useAuth()
  const canEdit = isAdmin
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchComments = async () => {
    setLoading(true)
    try {
      const params = filter !== 'all' ? `?status=${filter}` : ''
      const data = await api.get(`/comments/all${params}`)
      setComments(data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchComments() }, [filter])

  const handleAction = async (id, action) => {
    try {
      await api.put(`/comments/${id}/${action}`)
      fetchComments()
    } catch {}
  }

  const handleDelete = async (id) => {
    try {
      await api.del(`/comments/${id}`)
      fetchComments()
    } catch {}
  }

  const statusColors = {
    pending: 'bg-amber-400/20 text-amber-400 border-amber-400/40',
    approved: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/40',
    rejected: 'bg-rose-400/20 text-rose-400 border-rose-400/40',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-black text-theme">Comments</h1>
        <p className="text-muted text-sm mt-1">Review and moderate player comments</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filter === s ? 'bg-lime-400 text-slate-950' : 'bg-surface border border-theme text-theme hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">No comments found.</div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="glass-panel rounded-2xl border border-theme p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs border border-lime-400/40 shrink-0">
                      {(c.user_name || 'U').charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-theme">{c.user_name || 'Unknown'}</span>
                      <span className="text-[10px] text-muted ml-2">{c.created_at?.slice(0, 16)}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusColors[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i < (c.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-theme leading-relaxed">{c.text}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canEdit && (
                    <>
                      {c.status !== 'approved' && (
                        <button onClick={() => handleAction(c.id, 'approve')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Approve">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {c.status !== 'rejected' && (
                        <button onClick={() => handleAction(c.id, 'reject')} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Reject">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
