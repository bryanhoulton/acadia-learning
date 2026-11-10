import React, { useState } from 'react';

import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  TextInput,
} from 'slate-ui';

const NotFound: React.FC = () => {
  const [roomCode, setRoomCode] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/room/${roomCode.trim()}`);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold mb-4 text-primary-200">
            Page Not Found
          </h2>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput
              type="text"
              value={roomCode}
              onChange={setRoomCode}
              placeholder="Enter room code"
              autoFocus
            />
            <Button
              type="submit"
              className="w-full"
              disabled={!roomCode.trim()}
              iconRight={ArrowRight}
            >
              Join Room
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
