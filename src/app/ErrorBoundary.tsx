import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || '알 수 없는 오류',
    };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div style={{ padding: 20, fontFamily: 'system-ui' }}>
        <h2>앱 오류가 발생했습니다.</h2>
        <p>새로고침 후 다시 시도해주세요.</p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.message}</pre>
      </div>
    );
  }
}
