import { Button, InputGroup, FormControl } from "react-bootstrap";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  loading?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onSearch,
  loading,
}: SearchBarProps) {
  return (
    <InputGroup className="mb-3">
      <FormControl
        placeholder="輸入 YouTube 關鍵字或網址..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        disabled={loading}
      />
      <Button variant="primary" onClick={onSearch} disabled={loading}>
        {loading ? "作業中..." : "搜尋"}
      </Button>
    </InputGroup>
  );
}
