import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Input } from '../components/ui/Input';

describe('MedCore HMS — Critical UI Components Suite', () => {
  describe('1. Button Component', () => {
    it('renders with children and handles click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Book Appointment</Button>);
      
      const btn = screen.getByRole('button', { name: /book appointment/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('respects disabled state and prevents clicks', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Submit Record</Button>);
      
      const btn = screen.getByRole('button', { name: /submit record/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('renders loading indicator when isLoading is true', () => {
      render(<Button isLoading>Processing...</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('2. StatusBadge Component', () => {
    it('renders formatted status with proper label', () => {
      render(<StatusBadge status="COMPLETED" />);
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });

    it('renders emergency or critical badges correctly', () => {
      render(<StatusBadge status="CRITICAL" />);
      expect(screen.getByText(/critical/i)).toBeInTheDocument();
    });
  });

  describe('3. LoadingState & ErrorState Components', () => {
    it('renders loading skeleton and message', () => {
      render(<LoadingState message="Fetching patient encounters..." />);
      expect(screen.getByText('Fetching patient encounters...')).toBeInTheDocument();
    });

    it('renders error state and triggers retry action', () => {
      const handleRetry = vi.fn();
      render(
        <ErrorState
          title="Failed to Load Lab Report"
          message="Server network connection timed out"
          onRetry={handleRetry}
        />,
      );

      expect(screen.getByText('Failed to Load Lab Report')).toBeInTheDocument();
      expect(screen.getByText('Server network connection timed out')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Input Component', () => {
    it('handles text input changes correctly', () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Search UHID" onChange={handleChange} />);

      const input = screen.getByPlaceholderText('Search UHID');
      fireEvent.change(input, { target: { value: 'METRO-2026-00001' } });
      expect(handleChange).toHaveBeenCalled();
    });

    it('displays validation error message when error prop is provided', () => {
      render(<Input error="Invalid dosage value" />);
      expect(screen.getByText('Invalid dosage value')).toBeInTheDocument();
    });
  });
});
