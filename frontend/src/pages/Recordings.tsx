import React, { useEffect, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { api, RecordingData } from '../services/api';
import { Film, Play, Download, Trash2, X, ShieldCheck, Clock, FileVideo } from 'lucide-react';

export const Recordings: React.FC = () => {
  const [recordings, setRecordings] = useState<RecordingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlayback, setActivePlayback] = useState<RecordingData | null>(null);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const data = await api.listRecordings();
      setRecordings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this video recording?')) return;
    try {
      await api.deleteRecording(id);
      fetchRecordings();
      if (activePlayback?.id === id) {
        setActivePlayback(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete recording');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <Film className="w-5 h-5 text-amber-500" />
              <span>Recording Library</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1 flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Only videos recorded with explicit participant consent are stored here.</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">Loading recordings...</div>
        ) : recordings.length === 0 ? (
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mx-auto text-gray-400">
              <Film className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-gray-300">No recordings saved yet.</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Recordings are created only when you request consent, the participant explicitly approves, and you click &ldquo;Start Recording&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col justify-between"
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded">
                      {formatFileSize(rec.fileSizeBytes)}
                    </span>
                    <span className="text-[11px] text-gray-400 flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{rec.durationSeconds}s duration</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{rec.sessionTitle}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Participant: <span className="text-gray-200">{rec.participantName}</span></p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {new Date(rec.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3 bg-gray-900/60 border-t border-gray-800 flex items-center justify-between">
                  <button
                    onClick={() => setActivePlayback(rec)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Watch</span>
                  </button>

                  <div className="flex items-center space-x-2">
                    <a
                      href={api.getRecordingStreamUrl(rec.id)}
                      download={`recording_${rec.id}.webm`}
                      className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(rec.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                      title="Delete Permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Video Playback Modal */}
      {activePlayback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{activePlayback.sessionTitle}</h3>
                <p className="text-xs text-gray-400">Participant: {activePlayback.participantName}</p>
              </div>
              <button
                onClick={() => setActivePlayback(null)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                src={api.getRecordingStreamUrl(activePlayback.id)}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
