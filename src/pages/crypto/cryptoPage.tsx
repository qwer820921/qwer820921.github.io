/* eslint-disable prettier/prettier */
import React, { useState, useEffect, useRef } from "react";
import Select from "react-select";
import DatePicker from "react-datepicker";
import { Rule } from "../../types";
import LoadingOverlay from "../../components/common/loadingOverlay";
import SEO from "../../components/common/seo/seo";
import { CandlestickData, createChart, Time } from "lightweight-charts";
import { QuickQueryOption, KlineData } from "./types";
import {
  getExchangeInfo,
  getIntervalOptions,
  getKlines,
  getQuickQueryOptions,
} from "./api/cryptoApi";
import ReactSelect from "../../components/formItems/reactSelect";
import "./styles/datepicker-custom.css";

const CryptoPage: React.FC = () => {
  const [symbolOptions, setSymbolOptions] = useState<Rule[]>([]);
  const [intervalOptions] = useState<Rule[]>(getIntervalOptions());
  const [quickOptions] = useState<QuickQueryOption[]>(getQuickQueryOptions());

  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [selectedInterval, setSelectedInterval] = useState<string>("1h");

  // 日期區間初始值
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0
  ); // 今天 00:00

  const [startDate, setStartDate] = useState<Date | null>(startOfToday);
  const [endDate, setEndDate] = useState<Date | null>(now);

  const [klineData, setKlineData] = useState<KlineData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getExchangeInfo().then(setSymbolOptions);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || klineData.length === 0) return;

    chartContainerRef.current.innerHTML = "";
    const chart = createChart(chartContainerRef.current);
    const candleSeries = chart.addCandlestickSeries();

    candleSeries.setData(
      klineData.map(([time, open, high, low, close]) => ({
        time: Number(time) / 1000, // 轉為秒
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
      })) as CandlestickData<Time>[]
    );

    return () => chart.remove();
  }, [klineData]);

  const handleQuery = async () => {
    if (!selectedSymbol || !selectedInterval) return;

    setIsLoading(true);
    try {
      const data = await getKlines({
        symbol: selectedSymbol,
        interval: selectedInterval,
        startTime: startDate?.getTime(),
        endTime: endDate?.getTime(),
      });
      setKlineData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSelect = async (option: QuickQueryOption) => {
    setSelectedSymbol(option.symbol);
    setSelectedInterval(option.interval);
    setStartDate(null);
    setEndDate(null);

    setIsLoading(true);
    try {
      const data = await getKlines({
        symbol: option.symbol,
        interval: option.interval,
        limit: option.limit,
      });
      setKlineData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-4">
      {/* <SEO
        title="子yee 萬事屋 | 加密貨幣資訊 - 即時加密貨幣市場數據"
        description="子yee 萬事屋提供最新的加密貨幣資訊與即時市場數據，幫助您掌握虛擬貨幣投資機會！"
        keywords="子yee 萬事屋, 加密貨幣, 虛擬貨幣, 市場數據, 投資機會, 加密貨幣資訊"
      /> */}
      <LoadingOverlay isLoading={isLoading} />
      <h1 className="mb-4 text-center">加密貨幣資訊</h1>

      <form className="row g-3 align-items-end">
        <div className="col-xl-3 col-lg-6">
          <div className="input-group">
            <span className="input-group-text">幣種</span>
            <div className="flex-grow-1">
              <ReactSelect
                id="symbol-select"
                isMulti={false}
                value={selectedSymbol}
                onValueChange={(value) => setSelectedSymbol(value as string)}
                items={symbolOptions}
              />
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-lg-6">
          <div className="input-group">
            <span className="input-group-text">K棒週期</span>
            <div className="flex-grow-1">
              <ReactSelect
                id="interval-select"
                isMulti={false}
                value={selectedInterval}
                onValueChange={(value) => setSelectedInterval(value as string)}
                items={intervalOptions}
              />
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-lg-6">
          <div className="input-group">
            <span className="input-group-text">開始日期</span>
            <div className="flex-grow-1">
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                showTimeSelect
                dateFormat="Pp"
                className="form-control"
                maxDate={endDate ? endDate : undefined}
              />
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-lg-6">
          <div className="input-group">
            <span className="input-group-text">結束日期</span>
            <div className="flex-grow-1">
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                showTimeSelect
                dateFormat="Pp"
                className="form-control"
                minDate={startDate || undefined}
              />
            </div>
          </div>
        </div>

        {/* <div className="col-xl-8 col-lg-12">
          <div className="row">
            <div className="col-lg-6">
              <div className="input-group">
                <span className="input-group-text">開始日期</span>
                <div className="flex-grow-1">
                  <DatePicker
                    selected={startDate}
                    onChange={(date: Date | null) => setStartDate(date)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    showTimeSelect
                    dateFormat="Pp"
                    className="form-control"
                    maxDate={endDate ? endDate : undefined}
                  />
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="input-group">
                <span className="input-group-text">結束日期</span>
                <div className="flex-grow-1">
                  <DatePicker
                    selected={endDate}
                    onChange={(date: Date | null) => setEndDate(date)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    showTimeSelect
                    dateFormat="Pp"
                    className="form-control"
                    minDate={startDate || undefined}
                  />
                </div>
              </div>
            </div>

          </div>
        </div> */}
      </form>

      <div className="mt-4">
        <button
          className="btn btn-primary"
          onClick={handleQuery}
          disabled={!selectedSymbol || !selectedInterval}
        >
          查詢 K 線圖
        </button>
      </div>

      <div className="mt-4">
        <h5>快速查詢</h5>
        <div className="d-flex flex-wrap gap-2">
          {quickOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => handleQuickSelect(opt)}
            >
              {opt.value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div ref={chartContainerRef} style={{ height: "400px" }} />
      </div>
    </div>
  );
};

export default CryptoPage;
