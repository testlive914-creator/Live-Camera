import React, { useState } from 'react';
import { X, Copy, Check, Share2, Sparkles, AlertCircle } from 'lucide-react';
import { api, SessionData } from '../services/api';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated?: (session: SessionData) => void;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onSessionCreated
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [createdData, setCreatedData] = useState<{
    session: SessionData;
    invitationUrl: string;
    whatsappUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Session title is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.createSession({
        title: title.trim(),
        description: description.trim(),
        durationMinutes,
        maxParticipants
      });
      setCreatedData({
        session: res.session,
        invitationUrl: res.invitationUrl,
        whatsappUrl: res.whatsappUrl
      });
      if (onSessionCreated) {
        onSessionCreated(res.session);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!createdData) return;
    try {
      await navigator.clipboard.writeText(createdData.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleReset = () => {
    setCreatedData(null);
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#111827] border border-[#1F2937] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1F2937] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Generate Invitation Link</h2>
          </div>
          <button
            onClick={handleReset}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-sm text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!createdData ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Session Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Live Catchup / Quick Selfie Stream"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Optional Description
                </label>
                <textarea
                  placeholder="Additional context shown to the participant before connecting..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 bg-[#0B0F19] border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Expiration Duration
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0B0F19] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours</option>
                    <option value={1440}>24 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Max Simultaneous Viewers
                  </label>
                  <select
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0B0F19] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value={1}>1 Participant</option>
                    <option value={2}>2 Participants</option>
                    <option value={4}>4 Participants (MVP Limit)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg shadow transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Invitation Link'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Invitation link created securely with cryptographic token.</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Shareable Participant URL
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={createdData.invitationUrl}
                    className="w-full px-3 py-2 bg-[#0B0F19] border border-gray-700 rounded-lg text-xs font-mono text-gray-200 select-all"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1 shrink-0 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-gray-900 rounded-lg border border-gray-800 text-xs text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300">Privacy Safeguard Notice:</p>
                <p>• Camera stream is live front-video only (no microphone/audio recorded or transmitted).</p>
                <p>• Friend must explicitly tap &ldquo;Start Selfie&rdquo; to accept camera prompt.</p>
                <p>• Video recording is completely separate and requires an explicit consent approval.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={createdData.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#20BA5C] text-black font-semibold text-sm rounded-lg transition-all shadow-lg shadow-emerald-900/20"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share via WhatsApp</span>
                </a>
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
