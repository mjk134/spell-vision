import { init } from "@paralleldrive/cuid2";

const createId = init({
    // the length of the id
    length: 10,
});

export default createId;