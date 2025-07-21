import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestModal: React.FC<TestModalProps> = ({ isOpen, onClose }) => {
  console.log('TestModal render:', { isOpen });
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-slate-950 border-slate-600/30">
        <DialogHeader>
          <DialogTitle className="text-white">Test Modal</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-slate-300">This is a test modal to verify Dialog component is working.</p>
          <Button onClick={onClose} className="mt-4 bg-violet-500/20 text-violet-300 border-violet-400/30 hover:bg-violet-500/30">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 