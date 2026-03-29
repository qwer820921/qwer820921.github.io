import React, { useState } from "react";
import { InputGroup, FormControl, Button, Spinner } from "react-bootstrap";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, loading }) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSearch(input.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      <InputGroup>
        <FormControl
          type="text"
          placeholder="搜尋 SoundCloud 曲目..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? <Spinner animation="border" size="sm" /> : "搜尋"}
        </Button>
      </InputGroup>
    </form>
  );
};

export default SearchBar;
