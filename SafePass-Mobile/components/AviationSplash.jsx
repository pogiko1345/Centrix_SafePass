import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from "react-native";
import { brandColors } from "../styles/brandColors";

const Logo = require("../assets/LogoSapphire.jpg");

export default function AviationSplash({
  mode = "landing",
  message = "Landing campus access...",
  arrivalMessage,
  duration = 1900,
  onBeforeFade,
  onDone,
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  const onBeforeFadeRef = useRef(onBeforeFade);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onBeforeFadeRef.current = onBeforeFade;
  }, [onBeforeFade]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // Keep navigation feedback brief; reduced-motion users skip the flight animation.
      const timer = setTimeout(() => {
        onBeforeFadeRef.current?.();
        onDoneRef.current?.();
      }, reducedMotion ? 0 : 350);
      return () => clearTimeout(timer);
    }
    progressAnim.setValue(0);
    overlayAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      easing: mode === "journey" ? Easing.linear : Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      if (!finished) return;
      onBeforeFadeRef.current?.();
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start(() => {
        onDoneRef.current?.();
      });
    });
  }, [duration, mode, overlayAnim, progressAnim]);

  const planeStyle = {
    opacity:
      mode === "journey"
        ? progressAnim.interpolate({
            inputRange: [0, 0.4, 0.47, 0.55, 0.64, 1],
            outputRange: [1, 1, 0.86, 0.86, 1, 1],
            extrapolate: "clamp",
          })
        : 1,
    transform: [
      {
        translateX: progressAnim.interpolate({
          inputRange: mode === "journey" ? [0, 0.4, 0.54, 0.84, 1] : [0, 0.72, 1],
          outputRange:
            mode === "journey"
              ? [-108, 144, -132, 82, 124]
              : mode === "takeoff"
                ? [-96, 78, 142]
                : [-132, 84, 124],
        }),
      },
      {
        translateY: progressAnim.interpolate({
          inputRange: mode === "journey" ? [0, 0.4, 0.54, 0.84, 1] : [0, 0.72, 1],
          outputRange:
            mode === "journey"
              ? [-5, -82, -62, -18, -6]
              : mode === "takeoff"
                ? [-5, -28, -76]
                : [-64, -18, -6],
        }),
      },
      {
        rotate: progressAnim.interpolate({
          inputRange: mode === "journey" ? [0, 0.4, 0.54, 0.84, 1] : [0, 0.72, 1],
          outputRange:
            mode === "journey"
              ? ["0deg", "-15deg", "-12deg", "-5deg", "0deg"]
              : mode === "takeoff"
                ? ["0deg", "-8deg", "-16deg"]
                : ["-13deg", "-5deg", "0deg"],
        }),
      },
    ],
  };
  const departureCaptionStyle = mode === "journey"
    ? {
        opacity: progressAnim.interpolate({
          inputRange: [0, 0.38, 0.5],
          outputRange: [1, 1, 0],
          extrapolate: "clamp",
        }),
      }
    : null;
  const arrivalCaptionStyle = mode === "journey"
    ? {
        opacity: progressAnim.interpolate({
          inputRange: [0.52, 0.64, 1],
          outputRange: [0, 1, 1],
          extrapolate: "clamp",
        }),
      }
    : null;

  const progressStyle = {
    transform: [
      {
        scaleX: progressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.04, 1],
        }),
      },
    ],
  };
  return (
    <Animated.View style={[styles.overlay, { opacity: overlayAnim, pointerEvents: "auto" }]}>
      <View style={styles.content}>
        <Image source={Logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.eyebrow}>SafePass Smart Campus</Text>
        <View style={styles.runwayScene}>
          <Animated.View style={[styles.plane, planeStyle]}>
            <View style={styles.planeBody}>
              <View style={styles.planeNose} />
              <View style={styles.planeWindowRow}>
                <View style={styles.planeWindow} />
                <View style={styles.planeWindow} />
                <View style={styles.planeWindow} />
              </View>
              <View style={styles.planeTail} />
              <View style={styles.planeWing} />
            </View>
          </Animated.View>
          <View style={styles.runway}>
            <View style={styles.runwayDash} />
            <View style={styles.runwayDash} />
            <View style={styles.runwayDash} />
          </View>
        </View>
        {mode === "journey" ? (
          <View style={styles.captionStack}>
            <Animated.Text style={[styles.caption, styles.captionLayer, departureCaptionStyle]}>
              {message}
            </Animated.Text>
            <Animated.Text style={[styles.caption, styles.captionLayer, arrivalCaptionStyle]}>
              {arrivalMessage || "Arriving at destination..."}
            </Animated.Text>
          </View>
        ) : (
          <Text style={styles.caption}>{message}</Text>
        )}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: brandColors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 360,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  logo: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#FFFFFF",
    marginBottom: 18,
  },
  eyebrow: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  runwayScene: {
    width: "100%",
    height: 116,
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  plane: {
    position: "absolute",
    left: "50%",
    bottom: 18,
    width: 70,
    height: 34,
    marginLeft: -35,
    alignItems: "center",
    justifyContent: "center",
  },
  planeBody: {
    width: 58,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(216,232,255,0.72)",
  },
  planeNose: {
    position: "absolute",
    right: -7,
    top: 2,
    width: 14,
    height: 10,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: "#FFFFFF",
    transform: [{ skewX: "-16deg" }],
  },
  planeWindowRow: {
    position: "absolute",
    left: 18,
    top: 4,
    flexDirection: "row",
    gap: 4,
    zIndex: 2,
  },
  planeWindow: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: brandColors.blue,
  },
  planeTail: {
    position: "absolute",
    left: -4,
    top: -10,
    width: 17,
    height: 16,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 10,
    backgroundColor: "#D8E8FF",
    transform: [{ rotate: "-18deg" }],
  },
  planeWing: {
    position: "absolute",
    left: 25,
    top: 9,
    width: 30,
    height: 12,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 14,
    backgroundColor: "#B7D5F6",
    transform: [{ skewX: "-28deg" }],
  },
  runway: {
    height: 2,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(216,232,255,0.38)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  runwayDash: {
    width: 42,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  caption: {
    color: "#D8E8FF",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 12,
  },
  captionStack: {
    width: "100%",
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  captionLayer: {
    position: "absolute",
    marginBottom: 0,
  },
  progressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(216,232,255,0.18)",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: brandColors.sky,
  },
});
