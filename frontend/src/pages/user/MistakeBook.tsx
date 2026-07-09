import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import api from '../../utils/api';
import { DEFAULT_QUESTION_DIFFICULTY } from '../../constants/questionDifficulty';

interface MistakeItem {
    _id: string;
    questionText: string;
    options: string[];
    correctAnswer: number;
    lastStudentAnswer: number;
    category: string;
    difficulty?: string;
    incorrectAttempts: number;
    correctStreak: number;
    lastAttemptAt: string;
    status: 'active' | 'mastered';
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const MistakeBook: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<MistakeItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [difficulties, setDifficulties] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [status, setStatus] = useState<'active' | 'mastered'>('active');
    const [sort, setSort] = useState('lastAttemptAt');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [minutes, setMinutes] = useState<number | ''>(15);
    const [activeCount, setActiveCount] = useState(0);
    const [masteredCount, setMasteredCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadMistakes = () => {
        setLoading(true);
        setError('');
        const query = new URLSearchParams({ page: String(page), limit: '8', status, sort });
        if (search) query.set('search', search);
        if (category) query.set('category', category);
        if (difficulty) query.set('difficulty', difficulty);
        api.get(`/user/mistakes?${query.toString()}`)
            .then((res) => {
                setItems(res.data.items || []);
                setCategories(res.data.categories || []);
                setDifficulties(res.data.difficulties || []);
                setPages(res.data.pages || 1);
                setActiveCount(res.data.activeCount || 0);
                setMasteredCount(res.data.masteredCount || 0);
            })
            .catch((err) => setError(err.response?.data?.message || 'Could not load mistake book. Please try again.'))
            .finally(() => setLoading(false));
    };

    useEffect(loadMistakes, [page, search, category, difficulty, status, sort]);

    const startPractice = () => {
        if (minutes === '') {
            alert('Please enter a valid practice duration in minutes.');
            return;
        }
        navigate(`/user/quiz/personal-practice?type=personal&source=mistakes&minutes=${minutes}`);
    };

    return (
        <UserLayout>
            <div className="learning-page">
                <section className="learning-hero">
                    <div>
                        <p className="learning-kicker">Weak Area Repository</p>
                        <h1>Mistake Book</h1>
                        <p>Incorrect answers are collected automatically and moved to mastered after three correct practice streaks.</p>
                    </div>
                    <div className="learning-practice-box">
                        <label>Practice timer</label>
                        <div>
                            <input type="number" min={1} max={180} value={minutes} onChange={(event) => setMinutes(event.target.value === '' ? '' : Number(event.target.value))} />
                            <span>minutes</span>
                        </div>
                        <button className="btn btn-accent" disabled={activeCount === 0} onClick={startPractice}>Practice Weak Areas</button>
                    </div>
                </section>

                <div className="learning-stats">
                    <div><span>Active Mistakes</span><strong>{activeCount}</strong></div>
                    <div><span>Mastered Questions</span><strong>{masteredCount}</strong></div>
                    <div><span>Current View</span><strong>{status === 'active' ? 'Active' : 'Mastered'}</strong></div>
                </div>

                <section className="learning-filters card">
                    <input className="form-input" placeholder="Search mistakes..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                    <select className="form-select" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                        <option value="">All Categories</option>
                        {categories.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                    <select className="form-select" value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }}>
                        <option value="">All Difficulties</option>
                        {difficulties.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                    <select className="form-select" value={status} onChange={(event) => { setStatus(event.target.value as 'active' | 'mastered'); setPage(1); }}>
                        <option value="active">Active Mistakes</option>
                        <option value="mastered">Mastered Questions</option>
                    </select>
                    <select className="form-select" value={sort} onChange={(event) => setSort(event.target.value)}>
                        <option value="lastAttemptAt">Recent Attempt</option>
                        <option value="incorrectAttempts">Most Incorrect</option>
                        <option value="category">Category</option>
                    </select>
                </section>

                {error && <div className="alert alert-error">{error}</div>}

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading mistake book...</div>
                ) : items.length === 0 ? (
                    <div className="learning-empty card">No questions in this view.</div>
                ) : (
                    <div className="learning-card-grid">
                        {items.map((item) => (
                            <article className={`learning-question-card ${item.status}`} key={item._id}>
                                <div className="learning-card-header">
                                    <span>{item.category}</span>
                                    <span>{item.difficulty || DEFAULT_QUESTION_DIFFICULTY}</span>
                                </div>
                                <h3>{item.questionText}</h3>
                                <div className="learning-options">
                                    {item.options.map((option, index) => (
                                        <div className={index === item.correctAnswer ? 'correct' : index === item.lastStudentAnswer ? 'incorrect' : ''} key={`${item._id}-${index}`}>
                                            <strong>{OPTION_LETTERS[index]}</strong>
                                            <span>{option}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mistake-meta">
                                    <div><span>Incorrect Attempts</span><strong>{item.incorrectAttempts}</strong></div>
                                    <div><span>Correct Streak</span><strong>{item.correctStreak}</strong></div>
                                    <div><span>Last Attempt</span><strong>{new Date(item.lastAttemptAt).toLocaleDateString()}</strong></div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                <div className="learning-pagination">
                    <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                    <span>Page {page} of {pages}</span>
                    <button className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
            </div>
        </UserLayout>
    );
};

export default MistakeBook;
