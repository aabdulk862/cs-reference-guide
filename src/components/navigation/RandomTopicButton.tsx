import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ManifestTopic {
  slug: string;
  subtopics?: { slug: string }[];
}

interface ManifestCategory {
  id: string;
  topics: ManifestTopic[];
}

export function RandomTopicButton() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Array<{ path: string }>>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/content-manifest.json');
        if (!res.ok) return;
        const data = await res.json();
        const paths: Array<{ path: string }> = [];
        for (const cat of data.categories as ManifestCategory[]) {
          for (const topic of cat.topics) {
            const topicSlug = topic.slug.includes('/') ? topic.slug.split('/').pop()! : topic.slug;
            if (topic.subtopics && topic.subtopics.length > 0) {
              for (const sub of topic.subtopics) {
                paths.push({ path: `/topic/${cat.id}/${topicSlug}/${sub.slug}` });
              }
            } else {
              paths.push({ path: `/topic/${cat.id}/${topicSlug}` });
            }
          }
        }
        setTopics(paths);
      } catch {
        // Manifest not available
      }
    }
    load();
  }, []);

  const handleRandom = useCallback(() => {
    if (topics.length === 0) return;
    const random = topics[Math.floor(Math.random() * topics.length)];
    navigate(random.path);
  }, [topics, navigate]);

  return (
    <button
      type="button"
      onClick={handleRandom}
      className="random-topic-btn"
      aria-label="Go to a random topic"
      title="Random topic"
    >
      🎲 Random
    </button>
  );
}
