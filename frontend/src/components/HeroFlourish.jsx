import ShinyText from '@/components/reactbits/ShinyText';
import GradientText from '@/components/reactbits/GradientText';

/**
 * The React Bits text effects, isolated into their own chunk.
 *
 * Both are driven by `motion`, which is a meaningful download for a purely
 * decorative shimmer. Keeping them here means the homepage only fetches that
 * code on devices that will actually animate it — see `useDecorativeEffects`.
 */

export function AnimatedEyebrow({ children, className }) {
  return (
    <GradientText colors={['#7c5cff', '#22d3ee', '#7c5cff']} animationSpeed={9} className={className}>
      {children}
    </GradientText>
  );
}

export function AnimatedHeadline({ text, className }) {
  return (
    <ShinyText
      text={text}
      speed={4}
      color="#a2a8bd"
      shineColor="#ffffff"
      className={className}
    />
  );
}
