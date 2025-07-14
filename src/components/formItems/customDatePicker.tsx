import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface CustomDatePickerProps {
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
  selectsStart?: boolean;
  selectsEnd?: boolean;
  startDate?: Date;
  endDate?: Date;
  showTimeSelect?: boolean;
  dateFormat?: string;
  maxDate?: Date;
  minDate?: Date;
  className?: string;
  disabled?: boolean;
  timeIntervals?: number;
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  selectedDate,
  onDateChange,
  selectsStart = false,
  selectsEnd = false,
  startDate = undefined,
  endDate = undefined,
  showTimeSelect = false,
  dateFormat = "yyyy/MM/dd h:mm aa",
  maxDate = undefined,
  minDate = undefined,
  className = "",
  disabled = false,
  timeIntervals = 30,
}) => {
  const [internalSelected, setInternalSelected] = useState<Date | null>(
    selectedDate
  );

  useEffect(() => {
    setInternalSelected(selectedDate);
  }, [selectedDate]);

  const handleChange = (date: Date | null) => {
    setInternalSelected(date);
    onDateChange(date);
  };

  return (
    <>
      <DatePicker
        selected={internalSelected}
        onChange={handleChange}
        selectsStart={selectsStart}
        selectsEnd={selectsEnd}
        startDate={startDate}
        endDate={endDate}
        showTimeSelect={showTimeSelect}
        dateFormat={dateFormat}
        maxDate={maxDate}
        minDate={minDate}
        className={`form-control ${className}`}
        disabled={disabled}
        timeIntervals={timeIntervals}
        wrapperClassName="w-100"
      />
    </>
  );
};

export default CustomDatePicker;
