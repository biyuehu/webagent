export type Maybe<T> = { _tag: 'Just'; value: T } | { _tag: 'Nothing' }

export type Either<L, R> = { _tag: 'Left'; left: L } | { _tag: 'Right'; right: R }

export const left = <L, R>(l: L): Either<L, R> => ({ _tag: 'Left', left: l })
export const right = <L, R>(r: R): Either<L, R> => ({ _tag: 'Right', right: r })
