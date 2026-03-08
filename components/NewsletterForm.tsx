'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewsletterForm() {
  const [email, setEmail] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail('');
  };

  return (
    <form onSubmit={handleEmailSubmit} className="flex gap-2">
      <Input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
      />
      <Button type="submit" className="bg-[#22C55E] hover:bg-[#16A34A] text-white">
        Join
      </Button>
    </form>
  );
}
