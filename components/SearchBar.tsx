'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  placeholder = 'Enter city or zip code',
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className={`flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 h-14 text-base bg-white text-gray-900 rounded-l-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-14 px-10 bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold text-base rounded-r-lg"
      >
        Search
      </Button>
    </form>
  );
}
