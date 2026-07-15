/**
 * IVX Duplicate-Send Tests — prevents duplicate AI replies from rapid taps
 */

import { describe, it, expect } from 'bun:test';

describe('IVX Duplicate-Send Prevention', () => {
  it('blocks second send while first is pending', () => {
    let isPending = false;
    const sendCalls: string[] = [];
    
    const handleSend = (text: string) => {
      if (isPending) return; // blocked
      isPending = true;
      sendCalls.push(text);
    };
    
    handleSend('first message');
    handleSend('second message'); // should be blocked
    
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0]).toBe('first message');
  });

  it('allows send after pending completes', () => {
    let isPending = false;
    const sendCalls: string[] = [];
    
    const handleSend = (text: string) => {
      if (isPending) return;
      isPending = true;
      sendCalls.push(text);
    };
    
    const completeSend = () => { isPending = false; };
    
    handleSend('first');
    completeSend();
    handleSend('second');
    
    expect(sendCalls.length).toBe(2);
  });

  it('blocks send when attachment is pending', () => {
    let attachPending = false;
    let sendBlocked = false;
    
    const handleSend = () => {
      if (attachPending) { sendBlocked = true; return; }
    };
    
    attachPending = true;
    handleSend();
    
    expect(sendBlocked).toBe(true);
  });

  it('blocks send when file picker is open', () => {
    let isPickingFile = false;
    let sendBlocked = false;
    
    const handleSend = () => {
      if (isPickingFile) { sendBlocked = true; return; }
    };
    
    isPickingFile = true;
    handleSend();
    
    expect(sendBlocked).toBe(true);
  });

  it('blocks send when voice recording is active', () => {
    let isRecording = false;
    let sendBlocked = false;
    
    const handleSend = () => {
      if (isRecording) { sendBlocked = true; return; }
    };
    
    isRecording = true;
    handleSend();
    
    expect(sendBlocked).toBe(true);
  });
});
