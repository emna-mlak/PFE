import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  UIManager,
  View,
} from "react-native";

import type { PlateReading } from "../../screens/dashboard/types";
import type { DashboardPalette } from "../../theme/palettes";
import { useTheme } from "../../theme/ThemeContext";
import type { TimelineDisplayRow, TimelineTone } from "./eventTimelineModel";
import { buildFilteredTimeline } from "./eventTimelineModel";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  readings: PlateReading[];
  shownCount: number;
  /** tactical : LIVE 5 lignes · flux : EVENTS scroll. */
  variant?: "tactical" | "flux";
};

const TACTICAL_OPTS = { maxItems: 5, maxOkRows: 2 } as const;
const FLUX_OPTS = { maxItems: 14, maxOkRows: 5 } as const;

function toneToColor(tone: TimelineTone, colors: DashboardPalette): string {
  switch (tone) {
    case "critical":
      return colors.statusUnpaid;
    case "warn":
      return colors.statusWanted;
    case "success":
      return colors.statusPaid;
    case "muted":
      return colors.statusUnknown;
    default:
      return colors.header;
  }
}

function toneToBorder(tone: TimelineTone, colors: DashboardPalette): string {
  switch (tone) {
    case "critical":
      return colors.statusUnpaid;
    case "warn":
      return colors.statusWanted;
    case "success":
      return colors.statusPaid;
    case "muted":
      return colors.sub;
    default:
      return colors.filterChipActiveBorder;
  }
}

export function MissionEventFeed({ readings, shownCount, variant = "tactical" }: Props) {
  const styles = useMissionControlStyles();
  const { colors } = useTheme();
  const rows = useMemo(() => {
    const o = variant === "flux" ? FLUX_OPTS : TACTICAL_OPTS;
    return buildFilteredTimeline(readings, { maxItems: o.maxItems, maxOkRows: o.maxOkRows });
  }, [readings, variant]);

  const isTactical = variant === "tactical";

  const topId = rows[0]?.id;
  const prevTopId = useRef<string | undefined>(undefined);
  const didMount = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (isTactical) return;
    LayoutAnimation.configureNext(
      LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
  }, [isTactical, rows.length]);

  useEffect(() => {
    if (isTactical) return;
    if (!topId) return;
    if (!didMount.current) {
      didMount.current = true;
      prevTopId.current = topId;
      return;
    }
    if (topId === prevTopId.current) return;
    prevTopId.current = topId;
    pulse.setValue(0.78);
    Animated.spring(pulse, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [isTactical, topId, pulse]);

  const headerRight =
    variant === "flux"
      ? `${rows.length}/${shownCount}`
      : `${rows.length}/${Math.max(shownCount, readings.length)}`;

  const body = (
    <>
      {rows.length === 0 ? (
        <Text style={styles.timelineEmpty}>En attente d&apos;événements…</Text>
      ) : (
        rows.map((row, index) => (
          <TimelineRowView
            key={row.id}
            row={row}
            isLatest={index === 0}
            pulse={index === 0 && !isTactical ? pulse : undefined}
            colors={colors}
            styles={styles}
            compact={isTactical}
          />
        ))
      )}
    </>
  );

  return (
    <View
      style={[
        styles.feedBox,
        isTactical && styles.timelineFeedTactical,
      ]}
    >
      <View style={[styles.timelineHeaderRow, isTactical && styles.timelineHeaderRowTactical]}>
        <Text style={[styles.timelineHeaderTitle, isTactical && styles.timelineHeaderTitleTactical]}>
          {isTactical ? "EVT" : "TIMELINE"}
        </Text>
        <Text style={styles.timelineHeaderMeta}>{headerRight}</Text>
      </View>
      {variant === "flux" ? (
        <ScrollView
          style={styles.timelineFluxScroll}
          contentContainerStyle={styles.timelineFluxContent}
          showsVerticalScrollIndicator={rows.length > 6}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.timelineBody}>{body}</View>
      )}
    </View>
  );
}

function TimelineRowView({
  row,
  isLatest,
  pulse,
  colors,
  styles,
  compact = false,
}: {
  row: TimelineDisplayRow;
  isLatest: boolean;
  pulse?: Animated.Value;
  colors: DashboardPalette;
  styles: ReturnType<typeof useMissionControlStyles>;
  compact?: boolean;
}) {
  const eventColor = toneToColor(row.tone, colors);
  const borderColor = toneToBorder(row.tone, colors);

  const inner = (
    <View
      style={[
        compact ? styles.timelineRowTactical : styles.timelineRow,
        isLatest && !compact && styles.timelineRowLatest,
        isLatest && compact && styles.timelineRowTacticalLatest,
        isLatest && { borderLeftWidth: compact ? 2 : 3, borderLeftColor: borderColor },
      ]}
    >
      <Text style={compact ? styles.timelineIconTactical : styles.timelineIcon}>{row.icon}</Text>
      <Text style={compact ? styles.timelineTimeTactical : styles.timelineTime}>{row.timeLabel}</Text>
      <Text
        style={[compact ? styles.timelinePlateTactical : styles.timelinePlate, { color: colors.rowPlate }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {row.plate}
      </Text>
      <Text
        style={[
          compact ? styles.timelineStatusTactical : styles.timelineStatus,
          { color: eventColor },
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {row.statusLabel}
      </Text>
    </View>
  );

  if (pulse && isLatest) {
    return <Animated.View style={{ opacity: pulse }}>{inner}</Animated.View>;
  }

  return inner;
}
