import halftoneMountains from "../../../assets/halftone-mountains.svg";

export function HalftoneMountainArtwork() {
  return (
    <div className="home-halftone-landscape" aria-hidden="true">
      <span
        className="home-halftone-landscape-vector"
        style={{
          WebkitMaskImage: `url(${halftoneMountains})`,
          maskImage: `url(${halftoneMountains})`,
        }}
      />
    </div>
  );
}
