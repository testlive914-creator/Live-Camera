import React, { useEffect, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { CreateSessionModal } from '../components/CreateSessionModal';
import { api, SessionData } from '../services/api';
import { ListOrdered, Plus, Share2, Ban, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await api.listSessions();
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this invitation link? No new participants will be able to join.')) return;
    try {
      await api.revokeSession(id);
      fetchSessions();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke session');
    }
  };

  const handleEnd = async (id: string) => {
    if (!confirm('End this session and disconnect all active viewers?')) return;
    try {
      await api.endSession(id);
      fetchSessions();
    } catch (err: any) {
      alert(err.message || 'Failed to end session');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      <Navbar onOpenCreateModal={() => setIsCreateModalOpen(true)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <ListOrdered className="w-5 h-5 text-blue-500" />
              <span>Invitation Sessions</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Manage your generated invitation tokens, view participant limits, and revoke links.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Invitation Link</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-medium text-gray-300">No sessions generated yet.</p>
            <p className="text-xs text-gray-500">Create your first invitation link to share via WhatsApp.</p>
          </div>
        ) : (
          <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-900/80 text-gray-400 uppercase font-medium border-b border-gray-800">
                  <tr>
                    <th className="px-6 py-3.5">Session Title</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Active / Max</th>
                    <th className="px-6 py-3.5">Expires At</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {sessions.map((s) => {
                    const isExpired = new Date(s.expiresAt).getTime() < Date.now();
                    return (
                      <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-white">{s.title}</p>
                          {s.description && <p className="text-gray-400 text-[11px] truncate max-w-xs">{s.description}</p>}
                        </td>
                        <td className="px-6 py-4">
                          {s.status === 'revoked' ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-800/50">
                              Revoked
                            </span>
                          ) : s.status === 'ended' ? (
                            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                              Ended
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/50">
                              Expired
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono">{s.activeParticipantCount || 0} / {s.maxParticipants}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          {new Date(s.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {s.status === 'active' && !isExpired && (
                            <>
                              <button
                                onClick={() => handleRevoke(s.id)}
                                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded text-[11px] font-medium border border-gray-700 transition-colors"
                              >
                                Revoke Link
                              </button>
                              <button
                                onClick={() => handleEnd(s.id)}
                                className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900/60 text-red-300 rounded text-[11px] font-medium border border-red-800/50 transition-colors"
                              >
                                End Session
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <CreateSessionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSessionCreated={() => fetchSessions()}
      />
    </div>
  );
};
