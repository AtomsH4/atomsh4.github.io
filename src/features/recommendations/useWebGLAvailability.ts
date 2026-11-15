import { useCallback, useEffect, useState } from 'react';

export type WebGLStatus =
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'failed';

export const useWebGLAvailability = (): {
  status: WebGLStatus;
  markFailed: () => void;
} => {
  const [status, setStatus] = useState<WebGLStatus>('checking');

  useEffect(() => {
    let active = true;

    try {
      const canvas = document.createElement('canvas');
      // The current renderer requires WebGL 2. Release this temporary probe
      // so the stage does not need a second active GPU context.
      const context = canvas.getContext('webgl2');
      context?.getExtension?.('WEBGL_lose_context')?.loseContext();

      if (active) {
        setStatus(context ? 'available' : 'unavailable');
      }
    } catch {
      if (active) {
        setStatus('unavailable');
      }
    }

    return () => {
      active = false;
    };
  }, []);

  const markFailed = useCallback(() => {
    setStatus('failed');
  }, []);

  return { status, markFailed };
};
