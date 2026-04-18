import { Component } from 'react';

/**
 * 하위 트리에서 던진 예외를 잡아 빈 화면 대신 복구 UI 를 표시.
 * 단일 탭이 크래시해도 전체 앱이 빈 화면이 되지 않도록 App 최상위에 배치.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 프로덕션에서는 원격 로깅 서비스로 보낼 위치. 지금은 콘솔.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || String(this.state.error);
    return (
      <div className="m-6 p-6 rounded-xl border border-warn/40 bg-warn/5 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block w-2 h-2 rounded-full bg-warn" />
          <span className="font-semibold text-warn">화면 렌더링 오류</span>
        </div>
        <div className="text-fg-muted mb-3 break-words">{msg}</div>
        <button
          type="button"
          onClick={this.reset}
          className="px-3 py-1.5 rounded bg-bg-inner border border-border text-fg-white hover:border-accent"
        >
          다시 시도
        </button>
      </div>
    );
  }
}
