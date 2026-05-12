import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  formatDuration,
  loadAllRecords,
  recentRecords,
  summarizeByLanguage,
  summarizeOverall,
} from '../lib/stats.js';
import { getLanguageLabel } from './LanguagePicker.js';

interface Props {
  onClose: () => void;
}

export const StatsView: React.FC<Props> = ({ onClose }) => {
  useInput(() => {
    onClose();
  });

  const records = useMemo(() => loadAllRecords(), []);
  const overall = useMemo(() => summarizeOverall(records), [records]);
  const recent = useMemo(() => recentRecords(records, 10), [records]);
  const byLanguage = useMemo(() => summarizeByLanguage(records), [records]);

  if (records.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">統計</Text>
        <Box marginTop={1}>
          <Text color="gray">
            まだ記録がありません。写経を完了するとここに表示されます。
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">何かキーで戻る</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">統計</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>サマリー</Text>
        <Row label="総セッション数" value={`${overall.sessions}`} />
        <Row label="累計打鍵数" value={`${overall.totalChars}`} />
        <Row label="累計時間" value={formatDuration(overall.totalDurationMs)} />
        <Row
          label="平均正解率"
          value={`${(overall.avgAccuracy * 100).toFixed(1)}%`}
        />
        <Row label="平均 WPM" value={overall.avgWpm.toFixed(1)} />
        <Row label="ベスト WPM" value={overall.bestWpm.toFixed(1)} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>直近 {recent.length} セッション</Text>
        <RecentTable records={recent} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>言語別集計</Text>
        <LanguageTable rows={byLanguage} />
      </Box>

      <Box marginTop={1}>
        <Text color="gray">何かキーで戻る</Text>
      </Box>
    </Box>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Box width={16}>
      <Text color="gray">{label}</Text>
    </Box>
    <Text>{value}</Text>
  </Box>
);

const RecentTable: React.FC<{ records: ReturnType<typeof loadAllRecords> }> = ({
  records,
}) => {
  return (
    <Box flexDirection="column">
      <HeaderRow
        cells={[
          { text: '日時', width: 17 },
          { text: '言語', width: 11 },
          { text: 'モデル', width: 28 },
          { text: 'WPM', width: 7 },
          { text: '正解率', width: 7 },
        ]}
      />
      {records.map((r, i) => (
        <Box key={`${r.ts}-${i}`}>
          <Cell width={17}>{formatTs(r.ts)}</Cell>
          <Cell width={11}>{shortLang(r.language)}</Cell>
          <Cell width={28}>{truncate(r.model, 28)}</Cell>
          <Cell width={7}>{r.wpm.toFixed(1)}</Cell>
          <Cell width={7}>{(r.accuracy * 100).toFixed(1)}%</Cell>
        </Box>
      ))}
    </Box>
  );
};

const LanguageTable: React.FC<{
  rows: ReturnType<typeof summarizeByLanguage>;
}> = ({ rows }) => {
  return (
    <Box flexDirection="column">
      <HeaderRow
        cells={[
          { text: '言語', width: 14 },
          { text: 'セッション', width: 11 },
          { text: '打鍵数', width: 10 },
          { text: '平均 WPM', width: 10 },
          { text: '平均正解率', width: 10 },
        ]}
      />
      {rows.map((r) => (
        <Box key={r.language}>
          <Cell width={14}>{shortLang(r.language)}</Cell>
          <Cell width={11}>{`${r.sessions}`}</Cell>
          <Cell width={10}>{`${r.totalChars}`}</Cell>
          <Cell width={10}>{r.avgWpm.toFixed(1)}</Cell>
          <Cell width={10}>{`${(r.avgAccuracy * 100).toFixed(1)}%`}</Cell>
        </Box>
      ))}
    </Box>
  );
};

const HeaderRow: React.FC<{ cells: { text: string; width: number }[] }> = ({
  cells,
}) => (
  <Box>
    {cells.map((c) => (
      <Box key={c.text} width={c.width}>
        <Text color="gray" bold>
          {c.text}
        </Text>
      </Box>
    ))}
  </Box>
);

const Cell: React.FC<{ width: number; children: React.ReactNode }> = ({
  width,
  children,
}) => (
  <Box width={width}>
    <Text>{children}</Text>
  </Box>
);

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function shortLang(id: string): string {
  if (!id || id === 'auto') return 'auto';
  const label = getLanguageLabel(id);
  return label.length > 10 ? id : label;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
