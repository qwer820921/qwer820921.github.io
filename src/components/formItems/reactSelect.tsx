/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import React, { useState } from "react";
import Select, { components } from "react-select";
import { XLg } from "react-bootstrap-icons";
import { Rule } from "../../types";

interface ReactSelectProps<T extends boolean = true> {
  id: string;
  isMulti: T;
  value?: T extends true ? string[] : string;
  onValueChange?: (value: T extends true ? string[] : string) => void;
  onBlur?: () => void;
  items: Rule[];
  disabled?: boolean;
  errorMessage?: string;
  disableDefault?: boolean;
  onInputChange?: (inputValue: string, action: string) => void;
}

const ReactSelect = <T extends boolean = true>({
  id,
  isMulti = true as T,
  value = (isMulti ? [] : "") as T extends true ? string[] : string, // 根據 isMulti 預設為空陣列或空字串
  onValueChange = () => {},
  onBlur = () => {},
  items = [],
  disabled = false,
  errorMessage,
  disableDefault = false,
  onInputChange = () => {},
}: ReactSelectProps<T>) => {
  const [selectAll, setSelectAll] = useState<boolean>(false);

  // 格式化 items 為 react-select 所需的格式
  const formattedItems = items.map((item) => ({
    value: item.key,
    label: item.value,
  }));

  const handleChange = (selected: any) => {
    if (isMulti) {
      if (selected.some((item: any) => item.value === "selectAll")) {
        handleSelectAll();
      } else {
        const newValues = selected.map((item: any) => item.value);
        onValueChange(newValues.length > 0 ? newValues : undefined);
        setSelectAll(newValues.length === formattedItems.length);
      }
    } else {
      // 單選情況
      onValueChange(selected ? selected.value : undefined);
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      onValueChange([] as unknown as T extends true ? string[] : never); // 清空多選
    } else {
      onValueChange(
        formattedItems.map((item) => item.value) as unknown as T extends true
          ? string[]
          : never // 全選多選
      );
    }
    setSelectAll(!selectAll);
  };

  const handleClear = () => {
    onValueChange(undefined as unknown as T extends true ? string[] : never);
  };

  // 在選項中添加選擇全部的選項
  const enhancedItems = isMulti
    ? [
        {
          value: "selectAll",
          label: selectAll ? "取消全選" : "全選",
        },
        ...formattedItems,
      ]
    : !disableDefault
      ? [
          {
            value: "",
            label: "請輸入...",
          },
          ...formattedItems,
        ]
      : formattedItems;

  // 自定義選項組件
  const SelectOption = (props: any) => {
    const { data, innerProps, innerRef } = props;
    return (
      <components.Option {...props} innerRef={innerRef} innerProps={innerProps}>
        {data.value === "selectAll" && isMulti ? (
          <div onClick={handleSelectAll}>{data.label}</div>
        ) : (
          data.label
        )}
      </components.Option>
    );
  };

  //只查詢label的部分,防止查詢的時候會查到key
  const customFilterOption = (option: any, inputValue: string) => {
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        flexWrap: "wrap",
      }}
    >
      <Select
        closeMenuOnSelect={!isMulti} //當使用者選擇選項時關閉選擇選單(僅單選時關閉)
        isMulti={isMulti} //支援多選選項
        isClearable={false} //支援清除功能
        id={id}
        value={
          isMulti
            ? enhancedItems.filter((item) =>
                (value as string[]).includes(item.value)
              )
            : enhancedItems.find((item) => item.value === value) || null
        } // 根據是否多選來設定 value
        onChange={handleChange}
        onInputChange={(inputValue, actionMeta) => {
          // 傳遞輸入值和動作到外部
          onInputChange(inputValue, actionMeta.action);
        }}
        onBlur={onBlur}
        options={enhancedItems}
        components={{
          Option: SelectOption,
          DropdownIndicator: () => null,
          IndicatorSeparator: () => null,
          // Input: (props) => (
          //   <components.Input {...props} aria-activedescendant={undefined} />
          // ),
        }}
        isDisabled={disabled}
        styles={{
          container: (defaultStyles) => ({
            ...defaultStyles,
            flex: 1,
          }),
          control: (defaultStyles) => ({
            ...defaultStyles,
            border: "none",
            boxShadow: "none",
            minHeight: 0,
            backgroundColor: "transparent",
          }),
          clearIndicator: (defaultStyles) => ({
            ...defaultStyles,
            padding: "0",
          }),
          valueContainer: (defaultStyles) => ({
            ...defaultStyles,
            padding: "0",
          }),
          input: (defaultStyles) => ({
            ...defaultStyles,
            margin: "0",
            padding: "0",
          }),
          menu: (defaultStyles) => ({
            ...defaultStyles,
            zIndex: 5,
            left: 0,
          }),
          menuList: (defaultStyles) => ({
            ...defaultStyles,
            zIndex: 5,
          }),
          singleValue: (defaultStyles) => ({
            ...defaultStyles,
            color: "var(--bs-dark)",
            textAlign: "left",
          }),
          placeholder: (defaultStyles) => ({
            ...defaultStyles,
            color: "var(--bs-dark)",
            textAlign: "left",
          }),
          option: (defaultStyles) => ({
            ...defaultStyles,
            textAlign: "left",
          }),
        }}
        className={`form-select ${disabled ? "bg-disabled" : "bg-white"} ${errorMessage && "is-invalid"} `}
        classNamePrefix="select"
        placeholder="請輸入..."
        filterOption={customFilterOption}
      />
      {!disabled && (
        <span className="input-group-text rounded-end" id="basic-addon2">
          <XLg size={14} onClick={handleClear} role="button" />
        </span>
      )}
      {errorMessage && (
        <div className="invalid-feedback text-start">{errorMessage}</div>
      )}
    </div>
  );
};

export default ReactSelect;
