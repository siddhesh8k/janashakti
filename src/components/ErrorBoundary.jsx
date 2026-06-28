import { Component } from 'react';

// A stale deploy can leave a tab requesting an old hashed chunk that no longer exists;
// Firebase's SPA rewrite then returns index.html (text/html) for that .js, so the lazy
// import() rejects with "not a valid JavaScript MIME type". Detect that and reload ONCE
// to pull the fresh index + current chunks (guarded so it can't loop).
const CHUNK_ERROR = /valid JavaScript MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i;

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]:', error, info);
    if (CHUNK_ERROR.test(error?.message || '') && !sessionStorage.getItem('js-chunk-reloaded')) {
      sessionStorage.setItem('js-chunk-reloaded', '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center',
                      backgroundColor: '#080f1e', minHeight: '100vh',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#f0f6ff', fontSize: '16px', fontWeight: '600',
                      marginBottom: '8px' }}>Something went wrong</p>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button onClick={() => window.location.reload()}
            style={{ backgroundColor: '#00d4ff', color: '#04091a',
                     borderRadius: '10px', padding: '12px 24px',
                     border: 'none', cursor: 'pointer', fontWeight: '600' }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
