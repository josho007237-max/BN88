import React, { useState } from "react";

type SecretInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
};

const SecretInput: React.FC<SecretInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  name,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-200">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          name={name}
          type={visible ? "text" : "password"}
          className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-md border border-gray-600 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-700"
        >
          {visible ? "ซ่อน" : "ดู"}
        </button>
      </div>
    </div>
  );
};

export default SecretInput;
