import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './primitives';

function ModalHarness() {
  const [value, setValue] = useState('');
  return (
    <Modal open onClose={() => undefined} title="Edit profile">
      <input aria-label="Name" value={value} onChange={(event) => setValue(event.target.value)} />
      <button>Save</button>
    </Modal>
  );
}

describe('Modal', () => {
  it('does not steal focus when an inline close callback changes during a rerender', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    render(<ModalHarness />);
    const input = screen.getByRole('textbox', { name: 'Name' });

    input.focus();
    fireEvent.change(input, { target: { value: 'Jordan' } });

    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Jordan');
  });
});
