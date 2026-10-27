import React from 'react';

export function isChunkLoadError(error) {
  return error?.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed/i.test(String(error?.message || ''));
}

/**
 * Keeps a crash in the weighing screen from blanking the whole app mid-shift.
 * Saved weights live in Firestore drafts / the local offline queue, so
 * remounting or reloading picks up where the worker stopped.
 */
export default class DeliveryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[delivery] screen crashed', error, info?.componentStack);
  }

  handleRetry() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // React.lazy keeps the rejected import, so only a full reload recovers a chunk error.
    const chunkError = isChunkLoadError(error);
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6" role="alert">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="text-5xl" aria-hidden="true">⚠️</div>
          <div dir="rtl" className="space-y-1">
            <div className="text-xl font-black text-gray-900">אירעה תקלה במסך השקילה</div>
            <div className="text-sm font-semibold text-gray-600">המשקלים שכבר נשמרו לא נמחקו. לחצו כדי להמשיך.</div>
          </div>
          <div dir="ltr" className="space-y-1">
            <div className="text-xl font-black text-gray-900">หน้าจอชั่งน้ำหนักมีปัญหา</div>
            <div className="text-sm font-semibold text-gray-600">น้ำหนักที่บันทึกแล้วไม่หาย กดปุ่มด้านล่างเพื่อทำงานต่อ</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            {!chunkError && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="min-h-[52px] px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black"
              >
                נסה שוב · ลองอีกครั้ง
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`min-h-[52px] px-6 rounded-xl font-black ${
                chunkError ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-white border-2 border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              טען מחדש · โหลดใหม่
            </button>
          </div>
          <div dir="ltr" className="text-[11px] text-gray-400 break-words">{String(error?.message || error)}</div>
        </div>
      </div>
    );
  }
}
