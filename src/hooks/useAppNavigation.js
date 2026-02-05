import { useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to handle browser back button within the app.
 * Prevents browser back from logging users out by managing view state in history.
 *
 * @param {Object} viewState - Current view state (e.g., { view: 'session', id: '123' })
 * @param {Function} onBack - Callback to handle going back (sets state to previous view)
 */
export function useAppNavigation(viewState, onBack) {
  const isHandlingPopState = useRef(false);
  const lastPushedState = useRef(null);

  // Push state to history when view changes
  useEffect(() => {
    // Skip if we're handling a popstate (going back)
    if (isHandlingPopState.current) {
      isHandlingPopState.current = false;
      return;
    }

    // Only push if view has actually changed
    const stateKey = JSON.stringify(viewState);
    if (stateKey === lastPushedState.current) {
      return;
    }

    // Push new state to history
    if (viewState.view !== 'dashboard') {
      window.history.pushState({ appView: viewState }, '', window.location.pathname);
      lastPushedState.current = stateKey;
    }
  }, [viewState]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (event) => {
      // Mark that we're handling popstate to prevent re-pushing
      isHandlingPopState.current = true;

      // Call the back handler
      onBack();

      // Prevent default browser behavior by pushing current location back
      // This keeps us on the same page
      if (!event.state?.appView) {
        // We've gone back to the initial state, push a dummy state to prevent leaving
        window.history.pushState({ appView: { view: 'dashboard' } }, '', window.location.pathname);
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Push initial state on mount
    if (!window.history.state?.appView) {
      window.history.replaceState({ appView: { view: 'dashboard' } }, '', window.location.pathname);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBack]);
}

/**
 * Helper to get current view state from dashboard state
 */
export function getViewState({
  showHeartJournal,
  showThinkListPage,
  showActivityHistory,
  showJournalingPage,
  selectedSession,
  viewingHeartJournal,
  viewingThinkList,
  viewingJournal,
  selectedCounselee
}) {
  if (showHeartJournal || viewingHeartJournal) {
    return { view: 'heartJournal' };
  }
  if (showThinkListPage || viewingThinkList) {
    return { view: 'thinkList' };
  }
  if (showActivityHistory) {
    return { view: 'activityHistory' };
  }
  if (showJournalingPage || viewingJournal) {
    return { view: 'journaling' };
  }
  if (selectedSession) {
    return { view: 'session', id: selectedSession.id };
  }
  if (selectedCounselee) {
    return { view: 'counseleeDetail', id: selectedCounselee.id };
  }
  return { view: 'dashboard' };
}
